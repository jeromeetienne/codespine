---
name: code-graph-query
description: >-
  Query a TypeScript codebase as a knowledge graph to answer impact, caller,
  dependency, and dead-code questions. Use this instead of grep/glob for
  "who calls X", "what breaks if I change X" (blast radius), "is X dead code",
  "what references this type", and "what is X connected to". Requires the
  ts-knowledge-graph CLI and a built graph database.
---

# code-graph-query

Answer structural questions about a TypeScript project by querying a semantic
knowledge graph (built with the TypeScript compiler API) rather than reading or
grepping source files. The graph has resolved symbols and types, so its answers
are precise where text search is not.

## When to use this skill

Reach for these commands — not `Grep`/`Glob` — when the question is about code
structure or impact:

- **Callers** — "who calls this function?" → `who-calls`
- **Callees** — "what does this function call?" → `calls`
- **Impact / blast radius** — "what breaks if I change this?" → `blast-radius`
- **References** — "what uses this symbol or type?" → `references`
- **Dead code** — "which exports are unused?" → `dead-exports`
- **Neighbourhood** — "what is this connected to?" → `neighbors`
- **Hotspots** — "where is runtime actually spent / what is worth optimizing?" → `hotspots`
- **Inclusive cost** — "which symbols dominate total runtime cost?" → `cost`
- **Communities** — "what are the natural module clusters?" → `cluster`; name them in-session (no API key) with `cluster communities` + `cluster rename`, or the `/code-graph-name-communities` command
- **Worklist** — "what should I optimize first?" → `campaign`

For reading the actual implementation of a known file, normal file tools are
still the right choice. Use this skill to decide *which* code matters first.

## Prerequisite: build the graph once

Querying needs a Kùzu database at `./.ts_knowledge_graph/graph.kuzu`. If it is missing,
build it first (the `--semantic` flag is required for `CALLS` and heritage
edges, which power `who-calls`, `calls`, and `blast-radius`):

```bash
npx ts-knowledge-graph extract <path-to-project> --semantic   # writes ./.ts_knowledge_graph/graph/*.jsonl
npx ts-knowledge-graph load                                   # writes ./.ts_knowledge_graph/graph.kuzu
```

Inside this repository's own checkout, substitute `npm run dev --` for the
`ts-knowledge-graph` binary (e.g. `npm run dev -- load`).

## Core workflow: names are not ids

Every query that inspects a symbol takes a **node id**, not a name. Resolve a
name to id(s) first with `find`, then pass an id to the other commands. Never
hand-write ids.

```bash
npx ts-knowledge-graph find <name> --json        # -> array of { id, name, kind, filePath, startLine }
npx ts-knowledge-graph who-calls <id> --json     # use an id from the find result
```

Always pass `--json`; consume the JSON, not the human-readable output.

## Optimization targeting: making the graph runtime-aware

The graph is static by default, but it does **not** have to stay that way. Feed it
a V8 CPU profile and its nodes carry measured runtime metrics, so "where should I
optimize?" becomes a graph query instead of a guess:

1. **Profile.** Run the project (or a representative workload) under the V8
   sampler, which writes a `.cpuprofile`:

   ```bash
   node --cpu-prof --cpu-prof-dir ./prof ./your-workload.js   # writes ./prof/*.cpuprofile
   ```

2. **Enrich.** Join the profile onto the graph — this attaches `metadata.runtime`
   (self-time + sample counts) to nodes and adds `CALLS_RUNTIME` edges (the
   measured call graph):

   ```bash
   npx ts-knowledge-graph enrich ./prof/<file>.cpuprofile --root <project-root> --json
   ```

3. **Rank.** Now the runtime-aware queries have data to work with:

   ```bash
   npx ts-knowledge-graph hotspots --by self-time --json   # leaf hotspots by measured self time
   npx ts-knowledge-graph cost --json                      # inclusive cost: where time is spent under
   ```

Both `hotspots` and `cost` **degrade gracefully** when the graph has no profile:
`hotspots` falls back to static fan-in (`callers`) and `cost` propagates along the
static call graph, each printing a one-line notice. They are always safe to run —
just sharper once enriched.

## Command reference

All commands accept `-o, --output-folder <dir>` (default `./.ts_knowledge_graph`), and
all accept `--json` except `report`, which selects output with `--format <markdown|pdf|json>`.

| Command | Argument | Purpose |
| --- | --- | --- |
| `find <pattern>` | name substring | resolve a name to node id(s) |
| `who-calls <id>` | node id | direct callers of a symbol |
| `calls <id>` | node id | what a symbol directly calls |
| `blast-radius <id> [--depth <n>]` | node id | transitive callers / impact set (default depth 10) |
| `references <id>` | node id | everything referencing a symbol/type (calls, type usage, heritage, new) |
| `neighbors <id>` | node id | one-hop neighbourhood, inbound and outbound |
| `dead-exports` | (none) | exported symbols with no inbound references |
| `hotspots [--by <metric>] [--limit <n>]` | (none) | rank nodes by optimization leverage: `self-time`, `samples`, `callers`, `call-count`, `blast-radius` (default `self-time` when enriched, else `callers`) |
| `cost [id] [--by <metric>] [--edges <graph>]` | optional node id | inclusive runtime cost ranked by share of total; pass an id for a causal caller/callee breakdown |
| `campaign [--limit <n>] [--max-blast <n>]` | (none) | ranked, readiness-tagged optimization worklist: safe dead-code removals + hotspots, bounded by blast radius |
| `enrich <profile> [--root <path>]` | `.cpuprofile` path | ingest a V8 CPU profile: attach `metadata.runtime` + `CALLS_RUNTIME` edges |
| `cluster [detect] [--resolution <n>]` | (none) | detect communities (Leiden) and attach `metadata.community` (the default action) |
| `cluster communities` | (none) | list each community with its members, for an agent to name (see `/code-graph-name-communities`) |
| `cluster rename --labels <file>` | (none) | apply `{ "<index>": "<label>" }` labels onto `metadata.communityLabel` and the clustering manifest |
| `report [--format <fmt>] [--stdout]` | (none) | generate a CODEBASE_BRIEF (structure, impact, runtime, boundary) |

## Output contract

- `find`, `who-calls`, `calls`, `blast-radius`, `dead-exports` return a JSON
  array of `SymbolRef`: `{ id, kind, name, filePath, startLine }`.
- `references` and `neighbors` return `NeighborRef`: a `SymbolRef` plus
  `edgeKind` and `direction` (`"in"` or `"out"`).
- `hotspots`, `cost`, `enrich`, `cluster`, and `report --format json` each return
  their own report object (rankings, cost flows, or enrichment counts), not the
  `SymbolRef` / `NeighborRef` arrays above — read the `--json` payload's fields
  directly.

## Worked example

> "Is it safe to change the signature of `loadProject`?"

```bash
npx ts-knowledge-graph find loadProject --json          # -> get its id
npx ts-knowledge-graph blast-radius <id> --json         # -> every symbol transitively impacted
```

Report the impacted set (file paths + names) as the blast radius, then read
those specific call sites to judge the change.
