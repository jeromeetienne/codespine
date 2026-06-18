#!/usr/bin/env bash
#
# Generate a live V8 CPU profile for a sample project and enrich its graph with
# the measured runtime metrics (self time + sample count) via `enrich`.
#
# A short workload that exercises the project's public API is written into the
# project, run under `node --cpu-prof --import tsx` (a line-collapsing loader —
# the name-aware join handles it), then removed. The resulting `.cpuprofile` is
# joined onto the loaded graph at ./.codespine/<project>/graph.kuzu.
#
# Usage:  bash scripts/profile_and_enrich.sh project_01
#         npm run project01:enrich
#
# Prerequisite: the graph database must already be built and loaded
# (npm run projectNN:rebuild), exactly like the other projectNN query scripts.
set -euo pipefail

PROJECT="${1:?usage: profile_and_enrich.sh <project_01|project_02|project_03|project_04>}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

source "$ROOT/scripts/lib/workloads.sh"

PROJ="$ROOT/sample_projects/$PROJECT"
OUT="$ROOT/.codespine/$PROJECT"
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

DRIVER="$PROJ/._enrich_workload.ts"
cleanup() { rm -f "$DRIVER"; }
trap cleanup EXIT

rm -rf "$PROFDIR" && mkdir -p "$PROFDIR"
emit_workload "$PROJECT" > "$DRIVER"

echo "Profiling $PROJECT workload under V8 (node --cpu-prof --import tsx) ..."
node --cpu-prof --cpu-prof-dir "$PROFDIR" --import tsx "$DRIVER" >/dev/null
PROFILE="$(ls -t "$PROFDIR"/*.cpuprofile | head -1)"

$CLI enrich "$PROFILE" -o "$OUT" --root "$PROJ"
