#!/usr/bin/env bash
#
# Capacity test for the project_04 server inside a container under ENFORCED cgroup
# limits (realism track, ADR 0001 — docs/adr/0001-dockerized-workload-runner.md).
#
# It boots the real Express + better-sqlite3 server pinned to a fixed CPU/memory
# box ("one server"), ramps a concurrent HTTP load with autocannon, and reports the
# highest sustained request rate at which p99 latency stays under the SLO. That
# number is the per-box capacity: provision so steady-state load stays below it;
# cross it and you need another server.
#
# Both the server and the load client run INSIDE the one capped container and talk
# over 127.0.0.1, which avoids the macOS<->VM network-latency floor (the client then
# shares the CPU cap with the server — a documented realism-track trade-off).
#
# Like the profiling runner, only project_04 has runtime dependencies; they are
# installed once into a Linux-built named volume (a macOS-arm64 node_modules cannot
# run in the Linux VM) and reused across runs.
#
# Usage:
#   bash scripts/loadtest_docker.sh project_04 --cpus 0.5 --memory 512m
#   bash scripts/loadtest_docker.sh project_04 --cpus 0.5 --memory 512m --profile read
#   CONTAINER_CLI=podman bash scripts/loadtest_docker.sh project_04 --cpus 1
#
# Options:
#   --cpus <n>            CPU cap, real CFS quota (e.g. 0.5) — this defines "one server"
#   --memory <size>       memory cap; swap is disabled (--memory-swap=<size>)
#   --cpuset-cpus <list>  pin to specific cores (e.g. 0,1) to cut noise
#   --profile <p>         load shape: 'mixed' (reads + ~10% order writes, default) or 'read'
#   --slo-p99 <ms>        latency SLO; capacity = max rps with p99 <= this (default 200)
#   --start-rate <n>      first offered rate in req/s (default 10)
#   --step-rate <n>       rate increment per rung (default 20)
#   --max-rate <n>        stop ramping past this offered rate (default 1000)
#   --duration <sec>      measured seconds per rung (default 8)
#   --image <tag>         runner image (default tkg-loadtest-runner:node24)
#
# Prerequisite: a container runtime (Docker Desktop / OrbStack / podman). The graph
# database is NOT needed — this test only exercises the running server.
set -euo pipefail

CONTAINER_CLI="${CONTAINER_CLI:-docker}"
IMAGE='tkg-loadtest-runner:node24'
CPUS=''
MEMORY=''
CPUSET=''
PROFILE='mixed'
SLO_P99='200'
START_RATE='10'
STEP_RATE='20'
MAX_RATE='1000'
DURATION='8'

PROJECT=''
usage() {
	echo "usage: loadtest_docker.sh project_04 [--cpus n] [--memory size] [--cpuset-cpus list] [--profile mixed|read] [--slo-p99 ms] [--start-rate n] [--step-rate n] [--max-rate n] [--duration sec] [--image tag]" >&2
}
while [ $# -gt 0 ]; do
	case "$1" in
	--cpus) CPUS="${2:?--cpus needs a value}"; shift 2;;
	--memory) MEMORY="${2:?--memory needs a value}"; shift 2;;
	--cpuset-cpus) CPUSET="${2:?--cpuset-cpus needs a value}"; shift 2;;
	--profile) PROFILE="${2:?--profile needs a value}"; shift 2;;
	--slo-p99) SLO_P99="${2:?--slo-p99 needs a value}"; shift 2;;
	--start-rate) START_RATE="${2:?--start-rate needs a value}"; shift 2;;
	--step-rate) STEP_RATE="${2:?--step-rate needs a value}"; shift 2;;
	--max-rate) MAX_RATE="${2:?--max-rate needs a value}"; shift 2;;
	--duration) DURATION="${2:?--duration needs a value}"; shift 2;;
	--image) IMAGE="${2:?--image needs a value}"; shift 2;;
	-h|--help) usage; exit 0;;
	-*) echo "unknown option: $1" >&2; usage; exit 1;;
	*)
		if [ -z "$PROJECT" ]; then
			PROJECT="$1"
		else
			echo "unexpected argument: $1" >&2; usage; exit 1
		fi
		shift;;
	esac
done

if [ -z "$PROJECT" ]; then
	usage; exit 1
fi
if [ "$PROJECT" != 'project_04' ]; then
	echo "only project_04 is a server you can capacity-test; got '$PROJECT'" >&2
	exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJ="$ROOT/sample_projects/$PROJECT"
OUT="$ROOT/.codespine/$PROJECT/loadtest"
DRIVER="$ROOT/scripts/loadtest/loadtest_driver.ts"

if [ ! -d "$PROJ" ]; then
	echo "unknown project: $PROJECT (expected sample_projects/$PROJECT)" >&2
	exit 1
fi
if [ ! -f "$DRIVER" ]; then
	echo "load driver not found at $DRIVER" >&2
	exit 1
fi

# --- container runtime preflight ---------------------------------------------
if ! command -v "$CONTAINER_CLI" >/dev/null 2>&1; then
	echo "container CLI '$CONTAINER_CLI' not found — install Docker/OrbStack/podman, or set CONTAINER_CLI" >&2
	exit 1
fi
if ! "$CONTAINER_CLI" info >/dev/null 2>&1; then
	echo "container daemon not reachable ('$CONTAINER_CLI info' failed) — is Docker Desktop / OrbStack running?" >&2
	exit 1
fi

# --- build the runner image once, then reuse ---------------------------------
if ! "$CONTAINER_CLI" image inspect "$IMAGE" >/dev/null 2>&1; then
	echo "Building load-test runner image $IMAGE (one-time) ..."
	"$CONTAINER_CLI" build -t "$IMAGE" "$ROOT/scripts/loadtest"
fi

# --- provision the project's runtime dependencies (Linux build) --------------
# Same mechanism (and same volume name) as scripts/profile_and_enrich_docker.sh, so
# the express + better-sqlite3 install is shared between the two runners. Keyed by
# the lockfile so a dependency change re-provisions; mounted read-only at
# /work/node_modules, shadowing the host node_modules carried in by the /work mount.
DEPS_MOUNT=()
if [ -f "$PROJ/package.json" ] && node -e 'process.exit(Object.keys((require(process.argv[1]).dependencies)||{}).length>0?0:1)' "$PROJ/package.json" 2>/dev/null; then
	LOCKFILE="$PROJ/package-lock.json"
	[ -f "$LOCKFILE" ] || LOCKFILE="$PROJ/package.json"
	DEPS_KEY="$(cksum "$LOCKFILE" | cut -d' ' -f1)"
	DEPS_VOLUME="tkg-deps-${PROJECT}-${DEPS_KEY}"
	if ! "$CONTAINER_CLI" volume inspect "$DEPS_VOLUME" >/dev/null 2>&1; then
		echo "Provisioning $PROJECT runtime dependencies (Linux build) into volume $DEPS_VOLUME (one-time) ..."
		"$CONTAINER_CLI" volume create "$DEPS_VOLUME" >/dev/null
		INSTALL='npm ci --omit=dev --no-audit --no-fund'
		[ -f "$PROJ/package-lock.json" ] || INSTALL='npm install --omit=dev --no-audit --no-fund'
		if ! "$CONTAINER_CLI" run --rm \
			-v "$PROJ:/src:ro" -v "$DEPS_VOLUME:/app/node_modules" -w /app "$IMAGE" \
			sh -c "cp /src/package.json /app/ && { [ -f /src/package-lock.json ] && cp /src/package-lock.json /app/ || true; } && $INSTALL"; then
			echo "dependency provisioning failed for $PROJECT — removing $DEPS_VOLUME" >&2
			"$CONTAINER_CLI" volume rm "$DEPS_VOLUME" >/dev/null 2>&1 || true
			exit 1
		fi
	fi
	DEPS_MOUNT=(-v "$DEPS_VOLUME:/work/node_modules:ro")
fi

mkdir -p "$OUT"

# --- assemble the run --------------------------------------------------------
# Mounts: project read-only at /work, the Linux deps over /work/node_modules, the
# load driver into /opt/runner (where autocannon + tsx resolve), and the host output
# directory at /out for the JSON report.
RUN_FLAGS=(--rm
	-v "$PROJ:/work:ro"
	-v "$DRIVER:/opt/runner/loadtest_driver.ts:ro"
	-v "$OUT:/out"
)
[ ${#DEPS_MOUNT[@]} -gt 0 ] && RUN_FLAGS+=("${DEPS_MOUNT[@]}")
[ -n "$CPUS" ] && RUN_FLAGS+=(--cpus "$CPUS")
[ -n "$CPUSET" ] && RUN_FLAGS+=(--cpuset-cpus "$CPUSET")
if [ -n "$MEMORY" ]; then
	RUN_FLAGS+=(--memory "$MEMORY" --memory-swap "$MEMORY")
fi

# The server reads PORT and DB_PATH; the driver reads the LOADTEST_* knobs. DB_PATH
# is a real FILE under /tmp (writable) — not the :memory: default — so the order
# write path actually fsyncs and the write capacity is real.
RUN_FLAGS+=(
	-e SERVER_ENTRY=/work/src/main.ts
	-e SERVER_CWD=/opt/runner
	-e PORT=3000
	-e DB_PATH=/tmp/project_04_loadtest.db
	-e LOADTEST_OUT_DIR=/out
	-e LOADTEST_PROFILE="$PROFILE"
	-e LOADTEST_SLO_P99_MS="$SLO_P99"
	-e LOADTEST_START_RATE="$START_RATE"
	-e LOADTEST_STEP_RATE="$STEP_RATE"
	-e LOADTEST_MAX_RATE="$MAX_RATE"
	-e LOADTEST_STEP_DURATION_SEC="$DURATION"
	-e LOADTEST_PRODUCTS=20000
)

LIMITS=''
[ -n "$CPUS" ] && LIMITS+=" cpus=$CPUS"
[ -n "$CPUSET" ] && LIMITS+=" cpuset=$CPUSET"
[ -n "$MEMORY" ] && LIMITS+=" memory=$MEMORY"
[ -z "$LIMITS" ] && LIMITS=' (none specified — uncapped)'
echo "Realism track: enforced limits${LIMITS}. This box = 'one server'. Not a deterministic gate — see docs/adr/0001-dockerized-workload-runner.md."
echo "Capacity-testing $PROJECT in container ($IMAGE via $CONTAINER_CLI), profile=$PROFILE, slo p99<=${SLO_P99}ms ..."

exec "$CONTAINER_CLI" run "${RUN_FLAGS[@]}" "$IMAGE" \
	node --import tsx /opt/runner/loadtest_driver.ts
