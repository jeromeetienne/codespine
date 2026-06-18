#!/usr/bin/env bash
#
# Exercise the ts-knowledge-graph tools against sample_projects/project_04 — a real
# Express + SQLite (better-sqlite3) website whose endpoints do genuine CPU and
# disk/SQL work.
#
# It demonstrates the system-level layer: Endpoint / HANDLES (the routes and their
# handlers) and ConfigFlag / READS_CONFIG (the SQLite tuning knobs read from
# process.env). It then walks the behavioral spine — the route handlers call the
# services, which funnel every read through the instrumented Database wrapper — and
# enriches with a live V8 CPU profile of the disk-backed workload, so hotspots /
# cost rank the planted hot paths (the unindexed full-scan in ProductsService.list
# and Database.all, the LIKE-scan + JS ranking in SearchService.search). It closes
# on verify (type-check + tests) and the deterministic service-call workload report.
#
# Usage:  npm run project04:tour       (or)  bash scripts/project_04_tour.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT='sample_projects/project_04'
OUT='./.ts_knowledge_graph/project_04'
CLI='npx tsx src/cli.ts'

# Resolve a declaration to its node id by EXACT name. Optional 2nd argument filters
# by node kind, optional 3rd by a substring of the file path.
idof() {
	$CLI find "$1" -o "$OUT" --json 2>/dev/null \
		| node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));const l=Array.isArray(r)?r:(r.results||[]);const n=process.argv[1],k=process.argv[2],f=process.argv[3];const m=l.find(x=>x.name===n&&(k?x.kind===k:true)&&(f?(x.filePath||"").includes(f):true));if(!m){process.stderr.write("no node named "+n+"\n");process.exit(1);}process.stdout.write(m.id);' "$1" "${2:-}" "${3:-}"
}

section() { printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }

section 'rebuild the graph from scratch (clean → extract → load)'
rm -rf ./.ts_knowledge_graph/project_04/graph ./.ts_knowledge_graph/project_04/graph.kuzu ./.ts_knowledge_graph/project_04/prof
$CLI extract "$PROJECT/src" --semantic -o "$OUT"
$CLI load -o "$OUT"

section 'find Endpoint — the five routes plus the health probe, by kind'
$CLI find Endpoint -o "$OUT"

section 'neighbors GET /search — the route and its handler via HANDLES (expect search)'
$CLI neighbors 'Endpoint:GET /search' -o "$OUT"

section 'references the search handler — which endpoint routes to it, via HANDLES (expect GET /search)'
$CLI references "$(idof search Method search_routes.ts)" -o "$OUT"

section 'find ConfigFlag — the SQLite tuning knobs read from the environment (by kind)'
$CLI find ConfigFlag -o "$OUT"

section 'neighbors Config:DB_SYNCHRONOUS — the declaration that reads it via READS_CONFIG (expect Settings.load)'
$CLI neighbors 'Config:DB_SYNCHRONOUS' -o "$OUT"

section 'neighbors ProductsService.list — the planted scan hot path: it calls Database.all'
$CLI neighbors "$(idof list Method products_service.ts)" -o "$OUT"

section 'who-calls Database.all — every read funnels through one instrumented method'
$CLI who-calls "$(idof all Method database.ts)" -o "$OUT"

section 'cluster — group symbols into modules with the Leiden algorithm (rides metadata.community)'
$CLI cluster -o "$OUT"

section 'enrich — attach measured runtime from a live V8 CPU profile of the disk-backed workload'
bash "$ROOT/scripts/profile_and_enrich.sh" project_04

section 'hotspots — rank the whole graph by measured self-time (what enrich just unlocked)'
$CLI hotspots -o "$OUT" --by self-time

section 'cost — propagate self-time into inclusive cost, ranking by share of total (the causal view)'
$CLI cost -o "$OUT"

section 'verify — the optimize loop’s correctness gate: a full type-check + test pass'
$CLI verify --cwd "$PROJECT"

section 'workload (#38) — the deterministic service-call workload report (call counts + query counters)'
npx tsx "$ROOT/scripts/benchmarks/project_04_workload.ts"

section 'report — write the CODEBASE_BRIEF, one shareable snapshot of everything above'
$CLI report -o "$OUT"

section 'done'
printf 'Interactive: explore the same graph in the browser with\n  npm run project04:webview\n'
