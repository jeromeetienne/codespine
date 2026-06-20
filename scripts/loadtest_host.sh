#!/usr/bin/env bash
#
# Host (UNCAPPED) capacity test for the project_04 server — the same load driver as
# scripts/loadtest_docker.sh, but with NO container and NO cgroup cap: the server
# runs straight on the host with the full machine (all cores, the OS page cache, the
# host disk). Use it as the upper-bound baseline to compare against the constrained
# "one server" box (0.5 CPU / 512 MB) that the docker runner measures.
#
# The server is still single-threaded (Node + synchronous better-sqlite3), so it
# effectively uses ~one core regardless of how many the host has; the big host wins
# come from no CFS throttling and a large OS page cache over the SQLite file.
#
# Only ONE runtime flag differs from the shipped defaults: DB_PATH points at a real
# file (not the :memory: default) so the order-write path actually fsyncs. No source
# is modified.
#
# Usage:
#   bash scripts/loadtest_host.sh --profile mixed --slo-p99 800
#   bash scripts/loadtest_host.sh --profile read --slo-p99 200 --max-rate 300
set -euo pipefail

PROFILE='mixed'
SLO_P99='800'
START_RATE='10'
STEP_RATE='10'
MAX_RATE='300'
DURATION='8'
PORT='3204'

usage() {
	echo "usage: loadtest_host.sh [--profile mixed|read] [--slo-p99 ms] [--start-rate n] [--step-rate n] [--max-rate n] [--duration sec] [--port n]" >&2
}
while [ $# -gt 0 ]; do
	case "$1" in
	--profile) PROFILE="${2:?--profile needs a value}"; shift 2;;
	--slo-p99) SLO_P99="${2:?--slo-p99 needs a value}"; shift 2;;
	--start-rate) START_RATE="${2:?--start-rate needs a value}"; shift 2;;
	--step-rate) STEP_RATE="${2:?--step-rate needs a value}"; shift 2;;
	--max-rate) MAX_RATE="${2:?--max-rate needs a value}"; shift 2;;
	--duration) DURATION="${2:?--duration needs a value}"; shift 2;;
	--port) PORT="${2:?--port needs a value}"; shift 2;;
	-h|--help) usage; exit 0;;
	-*) echo "unknown option: $1" >&2; usage; exit 1;;
	*) echo "unexpected argument: $1" >&2; usage; exit 1;;
	esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PROJ="$ROOT/sample_projects/project_04"
OUT="$ROOT/.codespine/project_04/loadtest/host"
DRIVER="$ROOT/scripts/loadtest/loadtest_driver.ts"

# The server's runtime dependencies (express + better-sqlite3) must be the HOST build.
if [ ! -d "$PROJ/node_modules/express" ] || [ ! -d "$PROJ/node_modules/better-sqlite3" ]; then
	echo "installing project_04 host dependencies (one-time) ..."
	( cd "$PROJ" && npm install --no-audit --no-fund )
fi
# The driver needs autocannon + tsx, resolved from the repo-root node_modules.
if [ ! -d "$ROOT/node_modules/autocannon" ]; then
	echo "installing autocannon at the repo root (one-time) ..."
	( cd "$ROOT" && npm install )
fi

mkdir -p "$OUT"
DB_PATH="${TMPDIR:-/tmp}/project_04_loadtest_host.$$.db"

echo "Host baseline: UNCAPPED (full machine, no container). Single-threaded server uses ~one core."
echo "Capacity-testing project_04 on the host, profile=$PROFILE, slo p99<=${SLO_P99}ms ..."

SERVER_ENTRY="$PROJ/src/main.ts" \
SERVER_CWD="$ROOT" \
PORT="$PORT" \
DB_PATH="$DB_PATH" \
LOADTEST_OUT_DIR="$OUT" \
LOADTEST_PROFILE="$PROFILE" \
LOADTEST_SLO_P99_MS="$SLO_P99" \
LOADTEST_START_RATE="$START_RATE" \
LOADTEST_STEP_RATE="$STEP_RATE" \
LOADTEST_MAX_RATE="$MAX_RATE" \
LOADTEST_STEP_DURATION_SEC="$DURATION" \
LOADTEST_PRODUCTS=20000 \
	exec node --import tsx "$DRIVER"
