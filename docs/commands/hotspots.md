# `hotspots`

Rank nodes by optimization leverage — "what is worth optimizing?" — returning
the top-N symbols for a chosen metric, each with its score. It is the opinionated
counterpart to the raw traversal queries: where [`who-calls`](who-calls.md) and
[`blast-radius`](blast-radius.md) answer questions about one node, `hotspots`
scores the whole graph and hands back a ranking. Takes no argument.

Source: [`src/commands/hotspots_command.ts`](../../src/commands/hotspots_command.ts) ·
query: `GraphQuery.hotspots` in
[`src/query/graph_query.ts`](../../src/query/graph_query.ts)

## Synopsis

```bash
npx ts-knowledge-graph hotspots [options]
```

## Arguments

None. The command scans the whole graph.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-o, --output-folder <dir>` | `./outputs` | Output folder; the Kùzu database is read from `<dir>/graph.kuzu`. |
| `--by <metric>` | `self-time` when enriched, else `callers` | Ranking metric (see table below). |
| `--limit <n>` | `20` | Maximum number of hotspots. Clamped to the range `1`–`1000`. |
| `--measured-only` | `false` | Restrict ranking to nodes that carry `metadata.runtime`. |
| `--json` | `false` | Emit the raw JSON report instead of the formatted table. |

## What it does

Reads the graph once and ranks every node by the chosen metric, descending,
dropping nodes that score zero (a symbol nothing calls is not a fan-in hotspot)
and returning the top `--limit`.

### Metrics

| `--by` | Source | Meaning |
| --- | --- | --- |
| `self-time` | `metadata.runtime.selfMs` | Where measured CPU time is actually spent. *Default when the graph is enriched.* |
| `samples` | `metadata.runtime.samples` | Profiler hit count — a coarser stand-in for self time. |
| `callers` | inbound `CALLS` edge count | Static fan-in / centrality: how many distinct sites call this symbol. *Default when the graph is not enriched.* |
| `call-count` | sum of inbound `CALLS` edge `metadata.count` | How often the symbol is actually invoked across all call sites in source. |
| `blast-radius` | transitive inbound `CALLS` size | Change-risk / centrality: how many symbols would be impacted by changing it. |

The runtime metrics (`self-time`, `samples`) read the `metadata.runtime` written
by [`enrich`](enrich.md). The static metrics (`callers`, `call-count`,
`blast-radius`) are derived from the `CALLS` graph and need no enrichment, but do
need a `--semantic` extraction — on a structural-only graph there are no `CALLS`
edges and the ranking is empty.

`call-count` differs from `callers` whenever a symbol is called many times from a
few sites (a tight loop): `callers` counts the distinct callers, `call-count`
sums the call-site multiplicity preserved as edge `metadata.count`. `blast-radius`
differs from `callers` by following the call chain transitively, so a deep helper
at the bottom of a long chain ranks above a leaf with the same direct fan-in.

### Default and fallback

With no `--by`, the metric is chosen from the graph: `self-time` if any node
carries `metadata.runtime`, otherwise `callers`. Asking for a runtime metric on
an un-enriched graph does **not** return empty — it falls back to `callers`,
prints a one-line notice, and sets `fellBack: true` in the JSON report:

```
! no runtime data in graph — run `enrich` first. Ranking by `callers` (static fan-in) instead.
```

Ties are broken by file path, then declaration line, so the order is stable
across runs.

## Output

Formatted (default) — a header naming the metric, then one ranked line per
hotspot (`rank`, `score`, `kind`, `name`, `location`):

```
Hotspots by self-time
 1.       4.625 ms  Method     isValueRead  src/extract/semantic_extractor.ts:265
 2.       3.334 ms  Method     forDeclaration  src/extract/node_id.ts:9
 3.       1.292 ms  Class      KuzuStore  src/store/kuzu_store.ts:24

3 hotspot(s)
```

JSON (`--json`) — the full report. Each entry in `hotspots` is a `SymbolRef`
plus `score` and `metric`; the envelope records the metric used, what was
requested, and whether the graph is enriched / a fallback occurred:

```json
{
  "metric": "callers",
  "requested": "callers",
  "enriched": true,
  "fellBack": false,
  "measuredOnly": false,
  "hotspots": [
    {
      "id": "MethodDeclaration:src/extract/node_id.ts#forDeclaration@9",
      "kind": "Method",
      "name": "forDeclaration",
      "filePath": "src/extract/node_id.ts",
      "startLine": 9,
      "metadata": { "runtime": { "source": "v8-cpuprofile", "samples": 4, "selfMicros": 3334, "selfMs": 3.334 } },
      "score": 10,
      "metric": "callers"
    }
  ]
}
```

## Examples

```bash
# the default ranking — measured self time on an enriched graph, else fan-in
npx ts-knowledge-graph hotspots

# the most-called symbols in source (loop-heavy call sites rise to the top)
npx ts-knowledge-graph hotspots --by call-count --limit 10

# highest change-risk symbols — what the most code transitively depends on
npx ts-knowledge-graph hotspots --by blast-radius

# of the measured nodes, which has the highest static fan-in
npx ts-knowledge-graph hotspots --by callers --measured-only

# machine-readable — the shape the optimization agent consumes
npx ts-knowledge-graph hotspots --by self-time --json
```

## Notes and caveats

- **Runtime metrics need [`enrich`](enrich.md).** Without it the graph has no
  `metadata.runtime`; `--by self-time`/`samples` fall back to `callers`.
- **Static metrics need a `--semantic` extraction.** `CALLS` edges only exist on
  a semantic graph; a structural-only graph ranks empty for `callers`,
  `call-count`, and `blast-radius`.
- **`blast-radius` here is unbounded**, unlike the [`blast-radius`](blast-radius.md)
  command's `--depth` cap: this metric counts the full transitive inbound set so
  the ranking is comparable across nodes. It is cycle-safe.
- **Static call edges only.** Dynamic dispatch is invisible, so a real hotspot
  can rank lower than its true impact — confirm a candidate with
  [`who-calls`](who-calls.md) / [`blast-radius`](blast-radius.md) before acting.
- **Re-extract before trusting it.** The loader merges by id and does not remove
  stale nodes; for a clean reading, delete the database, re-extract, and reload —
  see [`load`](load.md).

## See also

- [`enrich`](enrich.md) — attach the `metadata.runtime` the runtime metrics rank by.
- [`blast-radius`](blast-radius.md) — the depth-bounded, single-node version of the transitive-reach metric.
- [`dead-exports`](dead-exports.md) — the other opinionated detector: the safest edits (removable code) rather than the highest-leverage ones.
- [`/code-graph-interview`](../../dotclaude_folder/commands/code-graph-interview.md) — scopes an optimization target; consumes this ranking instead of re-deriving it by hand.
