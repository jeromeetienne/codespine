#!/usr/bin/env bash
#
# Exercise the ts-knowledge-graph external-API tools against sample_projects/project_03.
#
# Builds the graph from scratch, then demonstrates the external-API surface: the
# ExternalAPI hosts and the CALLS_EXTERNAL edges that reach them, the client class
# hierarchy (EXTENDS / IMPLEMENTS / OVERRIDES), and the call graph rooted at the
# aggregator. It enriches with a live (offline-stubbed) CPU profile (hotspots /
# cost) and closes on the two optimize-loop gates: verify (type-check + tests) and
# benchmark (brief).
#
# Usage:  npm run project03:tour       (or)  bash scripts/project_03_tour.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT='sample_projects/project_03'
OUT='./.ts_knowledge_graph/project_03'
CLI='npx tsx src/cli.ts'

# Resolve a declaration to its node id by EXACT name. Optional 2nd argument
# filters by node kind, optional 3rd by a substring of the file path.
idof() {
	$CLI find "$1" -o "$OUT" --json 2>/dev/null \
		| node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));const l=Array.isArray(r)?r:(r.results||[]);const n=process.argv[1],k=process.argv[2],f=process.argv[3];const m=l.find(x=>x.name===n&&(k?x.kind===k:true)&&(f?(x.filePath||"").includes(f):true));if(!m){process.stderr.write("no node named "+n+"\n");process.exit(1);}process.stdout.write(m.id);' "$1" "${2:-}" "${3:-}"
}

section() { printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }

section 'rebuild the graph from scratch (clean → extract → load)'
rm -rf ./.ts_knowledge_graph/project_03/graph ./.ts_knowledge_graph/project_03/graph.kuzu ./.ts_knowledge_graph/project_03/prof
$CLI extract "$PROJECT/src" --semantic -o "$OUT"
$CLI load -o "$OUT"

section 'find ExternalAPI — the three upstream hosts the clients call (find matches by kind)'
$CLI find ExternalAPI -o "$OUT"

section 'neighbors api.open-meteo.com — who reaches this host, via CALLS_EXTERNAL (expect WeatherClient.current)'
$CLI neighbors "$(idof api.open-meteo.com ExternalAPI)" -o "$OUT"

section 'references BaseApiClient — the subclasses via EXTENDS (expect Weather/Country/Fx clients)'
$CLI references "$(idof BaseApiClient Class)" -o "$OUT"

section 'references ApiResource — implementers via IMPLEMENTS (expect BaseApiClient)'
$CLI references "$(idof ApiResource Interface)" -o "$OUT"

section 'who-calls brief — the aggregator’s in-graph caller (expect main)'
$CLI who-calls "$(idof brief Method)" -o "$OUT"

section 'calls brief — what the aggregator drives: the three client methods (each a CALLS_EXTERNAL hop away)'
$CLI calls "$(idof brief Method)" -o "$OUT"

section 'neighbors BriefService — one-hop: INSTANTIATES the three clients, called by main'
$CLI neighbors "$(idof BriefService Class)" -o "$OUT"

section 'blast-radius brief — everything reachable from the aggregator down to the fetch call sites'
$CLI blast-radius "$(idof brief Method)" -o "$OUT" --depth 10

section 'cluster — group symbols into modules with the Leiden algorithm; the community index rides metadata.community (no schema change)'
$CLI cluster -o "$OUT"

section 'enrich — attach measured runtime metrics from a live V8 CPU profile (upstream calls stubbed offline)'
bash "$ROOT/scripts/profile_and_enrich.sh" project_03

section 'find brief --json — the measured metrics now ride metadata.runtime (no schema change)'
$CLI find brief -o "$OUT" --json

section 'hotspots — rank the whole graph by measured self-time (what enrich just unlocked)'
$CLI hotspots -o "$OUT" --by self-time

section 'cost — propagate self-time into inclusive cost, ranking by share of total (the causal view)'
$CLI cost -o "$OUT"

section 'cost brief — where the aggregator’s inclusive cost goes (callees) and who is responsible for it (callers)'
$CLI cost "$(idof brief Method)" -o "$OUT"

section 'verify — the optimize loop’s hard correctness gate: this project’s type-check + tests as one keep/revert verdict'
$CLI verify --cwd "$PROJECT"

section 'benchmark brief — the advisory measured-impact gate: self-time over 3 runs (median + spread) on a fixed workload'
$CLI benchmark brief --workload "$ROOT/scripts/benchmarks/project_03_workload.ts" --root "$PROJECT" -o "$OUT" --runs 3

section 'report — write the CODEBASE_BRIEF, one shareable snapshot of everything above'
$CLI report -o "$OUT"

section 'done'
printf 'Interactive: explore the same graph in the browser with\n  npm run project03:webview\n'
