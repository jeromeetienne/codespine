#!/usr/bin/env bash
#
# Realism-track profiler (ADR 0001 — docs/adr/0001-dockerized-workload-runner.md).
#
# Runs a sample project's workload inside a container under ENFORCED cgroup
# limits (CPU / memory / disk-bps / network), writes a V8 .cpuprofile back to the
# host, and enriches the graph with it — exactly like the native runner
# scripts/profile_and_enrich.sh, but under real kernel-enforced limits that macOS
# cannot provide natively.
#
# Only the profiling step runs in the container; `enrich` runs on the host (it
# needs Kùzu's native addon). The sample project is bind-mounted read-only at
# /work and the profile directory read-write at /prof; the toolchain (`tsx`)
# lives in the image at /opt/runner. See the ADR for the full rationale.
#
# This is the REALISM track ("will it hold up on a constrained box?"), NOT the
# determinism track used for the agent's before/after deltas (that is the
# `benchmark` command). Numbers here carry scheduler noise by design.
#
# Usage:
#   bash scripts/profile_and_enrich_docker.sh project_01 --cpus 0.5 --memory 512m
#   CONTAINER_CLI=podman bash scripts/profile_and_enrich_docker.sh project_03 --cpus 1
#
# Options:
#   --cpus <n>                 CPU cap, real CFS quota (e.g. 0.5)
#   --memory <size>            memory cap; swap is disabled (--memory-swap=<size>)
#   --cpuset-cpus <list>       pin to specific cores (e.g. 0,1) to cut noise
#   --device-read-bps <d:bps>  disk read cap (VM device path, e.g. /dev/vda:1mb) *
#   --device-write-bps <d:bps> disk write cap                                      *
#   --netem <spec>             tc/netem spec, e.g. 'rate 1mbit delay 200ms loss 5%' *
#   --image <tag>              runner image (default tkg-workload-runner:node24)
#
#   * disk and network limits are PLUMBED but a no-op on the current sample
#     projects, which do no real disk/network I/O (ADR follow-up #1).
#
# Prerequisite: the graph database must already be built and loaded
# (npm run projectNN:rebuild), exactly like the native runner.
set -euo pipefail

CONTAINER_CLI="${CONTAINER_CLI:-docker}"
IMAGE='tkg-workload-runner:node24'
CPUS=''
MEMORY=''
CPUSET=''
DEVICE_READ_BPS=''
DEVICE_WRITE_BPS=''
NETEM=''

PROJECT=''
usage() {
	echo "usage: profile_and_enrich_docker.sh <project_01|project_02|project_03|project_04> [--cpus n] [--memory size] [--cpuset-cpus list] [--device-read-bps dev:bps] [--device-write-bps dev:bps] [--netem 'rate 1mbit delay 200ms loss 5%'] [--image tag]" >&2
}
while [ $# -gt 0 ]; do
	case "$1" in
	--cpus) CPUS="${2:?--cpus needs a value}"; shift 2;;
	--memory) MEMORY="${2:?--memory needs a value}"; shift 2;;
	--cpuset-cpus) CPUSET="${2:?--cpuset-cpus needs a value}"; shift 2;;
	--device-read-bps) DEVICE_READ_BPS="${2:?--device-read-bps needs a value}"; shift 2;;
	--device-write-bps) DEVICE_WRITE_BPS="${2:?--device-write-bps needs a value}"; shift 2;;
	--netem) NETEM="${2:?--netem needs a value}"; shift 2;;
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

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

source "$ROOT/scripts/lib/workloads.sh"

PROJ="$ROOT/sample_projects/$PROJECT"
OUT="$ROOT/.ts_knowledge_graph/$PROJECT"
DB="$OUT/graph.kuzu"
PROFDIR="$OUT/prof"
CLI='npx tsx src/cli.ts'

if [ ! -d "$PROJ" ]; then
	echo "unknown project: $PROJECT (expected sample_projects/$PROJECT)" >&2
	exit 1
fi
if [ ! -e "$DB" ]; then
	echo "graph database not found at $DB — run 'npm run ${PROJECT/project_/project}:rebuild' first" >&2
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
	echo "Building runner image $IMAGE (one-time) ..."
	"$CONTAINER_CLI" build -t "$IMAGE" "$ROOT/scripts/docker"
fi

# --- provision the project's runtime dependencies (Linux build) --------------
# Sample projects are normally dependency-free, so the container needs only tsx
# (baked into the image). A project with runtime dependencies — e.g. project_04's
# express + the better-sqlite3 native addon — cannot reuse the host node_modules
# (macOS arm64 binaries do not run in the Linux VM). Install them once into a named
# volume, keyed by the lockfile so a dependency change re-provisions, and mount it
# read-only at /work/node_modules, where the driver's bare imports resolve (the
# more-specific mount shadows the host node_modules carried in by the /work mount).
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

# --- write the workload driver into the project (cleaned up on exit) ----------
DRIVER="$PROJ/._enrich_workload.ts"
cleanup() { rm -f "$DRIVER"; }
trap cleanup EXIT

rm -rf "$PROFDIR" && mkdir -p "$PROFDIR"
emit_workload "$PROJECT" > "$DRIVER"

# --- assemble the enforced-limit flags ---------------------------------------
RUN_FLAGS=(--rm -v "$PROJ:/work:ro" -v "$PROFDIR:/prof")
[ ${#DEPS_MOUNT[@]} -gt 0 ] && RUN_FLAGS+=("${DEPS_MOUNT[@]}")
[ -n "$CPUS" ] && RUN_FLAGS+=(--cpus "$CPUS")
[ -n "$CPUSET" ] && RUN_FLAGS+=(--cpuset-cpus "$CPUSET")
if [ -n "$MEMORY" ]; then
	# --memory-swap == --memory disables swap: real memory pressure / OOM (ADR §4).
	RUN_FLAGS+=(--memory "$MEMORY" --memory-swap "$MEMORY")
fi
[ -n "$DEVICE_READ_BPS" ] && RUN_FLAGS+=(--device-read-bps "$DEVICE_READ_BPS")
[ -n "$DEVICE_WRITE_BPS" ] && RUN_FLAGS+=(--device-write-bps "$DEVICE_WRITE_BPS")

if [ -n "$DEVICE_READ_BPS" ] || [ -n "$DEVICE_WRITE_BPS" ]; then
	if [ ${#DEPS_MOUNT[@]} -gt 0 ]; then
		echo "note: $PROJECT does real disk I/O, but its SQLite file is written under /tmp; disk-bps only throttles a real block device, so whether the cap attaches is unverified (ADR follow-ups #2/#3)." >&2
	else
		echo "warning: disk-bps limits are plumbed but a no-op on $PROJECT — it does no real disk I/O (ADR follow-up #1)." >&2
	fi
fi
if [ -n "$NETEM" ]; then
	echo "warning: network shaping is plumbed but a no-op on $PROJECT — current sample projects make no network calls (ADR follow-up #1)." >&2
fi

# On native Linux, run as the host user so the .cpuprofile is not root-owned. On
# macOS (Docker Desktop / OrbStack) the VM maps ownership to the host user, and
# tc/netem needs root inside the container — so skip --user in those cases.
if [ "$(uname)" = 'Linux' ] && [ -z "$NETEM" ]; then
	RUN_FLAGS+=(--user "$(id -u):$(id -g)")
fi

# --- realism banner ----------------------------------------------------------
LIMITS=''
[ -n "$CPUS" ] && LIMITS+=" cpus=$CPUS"
[ -n "$CPUSET" ] && LIMITS+=" cpuset=$CPUSET"
[ -n "$MEMORY" ] && LIMITS+=" memory=$MEMORY"
[ -n "$DEVICE_READ_BPS" ] && LIMITS+=" read-bps=$DEVICE_READ_BPS"
[ -n "$DEVICE_WRITE_BPS" ] && LIMITS+=" write-bps=$DEVICE_WRITE_BPS"
[ -n "$NETEM" ] && LIMITS+=" netem=[$NETEM]"
[ -z "$LIMITS" ] && LIMITS=' (none specified)'
echo "Realism track: enforced limits${LIMITS}. Not the benchmark gate — see docs/adr/0001-dockerized-workload-runner.md."
echo "Profiling $PROJECT workload in container ($IMAGE via $CONTAINER_CLI) ..."

# --- run the profiling step under the limits ---------------------------------
NODE_CMD=(node --cpu-prof --cpu-prof-dir /prof --import tsx /work/._enrich_workload.ts)
if [ -n "$NETEM" ]; then
	# tc/netem needs NET_ADMIN; shape eth0, then exec the same node invocation.
	"$CONTAINER_CLI" run "${RUN_FLAGS[@]}" --cap-add NET_ADMIN "$IMAGE" \
		sh -c "tc qdisc add dev eth0 root netem ${NETEM} && exec node --cpu-prof --cpu-prof-dir /prof --import tsx /work/._enrich_workload.ts" >/dev/null
else
	"$CONTAINER_CLI" run "${RUN_FLAGS[@]}" "$IMAGE" "${NODE_CMD[@]}" >/dev/null
fi

# --- enrich on the host, exactly like the native path ------------------------
# --root /work matches the in-container frame paths; the join's relative-path
# resolution maps /work/src/... onto the graph's src/... nodes.
PROFILE="$(ls -t "$PROFDIR"/*.cpuprofile | head -1)"
$CLI enrich "$PROFILE" -o "$OUT" --root /work
