# `cost`

Propagate measured runtime **self cost** along the `CALLS` graph into
**inclusive cost** — self plus everything a node transitively calls — and report
each node's **share of total**. It is the causal counterpart to
[`hotspots`](hotspots.md): where `hotspots --by self-time` ranks by the
*exclusive* time spent *in* a node, `cost` answers the question the project was
built to produce —

> *This function is responsible for 40% of total measured time.*

With no argument it ranks the whole graph. With a node id it breaks one node's
cost down causally: where its inclusive cost **goes** (callees) and who is
**responsible** for it (callers).

Source: [`src/commands/cost_command.ts`](../../src/commands/cost_command.ts) ·
queries: `GraphQuery.costRanking` / `GraphQuery.costAttribution` in
[`src/query/graph_query.ts`](../../src/query/graph_query.ts)

## Synopsis

```bash
npx ts-knowledge-graph cost [id] [options]
```

## Arguments

| Argument | Description |
| --- | --- |
| `[id]` | Optional. A node id (from [`find`](find.md)) to break down causally. Omit it to rank the whole graph. |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-d, --db <path>` | `./outputs/graph.kuzu` | Kùzu database path. |
| `--by <metric>` | `self-time` | Cost metric to propagate: `self-time` (`metadata.runtime.selfMs`) or `samples` (`metadata.runtime.samples`). |
| `--limit <n>` | `20` | Maximum number of ranked nodes (ranking mode only). Clamped to `1`–`1000`. |
| `--json` | `false` | Emit the raw JSON report instead of the formatted output. |

## The cost model

Each node has a measured **self cost** `self(n)` — the exclusive time
[`enrich`](enrich.md) attributed to it (0 when unmeasured). Each `CALLS` edge
carries a call-site `count` (the [edge weight](../../README.md#graph-model)).
Inclusive cost propagates along those edges:

```
W_in(c)      = Σ over callers p of  count(p → c)            (inbound call weight)
inclusive(n) = self(n) + Σ over callees c of  inclusive(c) × count(n → c) / W_in(c)
shareOfTotal(n) = inclusive(n) / Σ over all nodes of self
```

A callee's inclusive cost is **partitioned** among its callers in proportion to
how often each calls it. That normalization is what makes the model *conserve*
cost: a diamond (`A → B → D`, `A → C → D`) does not double-count `D`, and
`shareOfTotal` is a true fraction in `[0, 1]`. This is the standard gprof / pprof
attribution. (The narrative formula in
[blog post 7](../blog/07_making_the_graph_causal_runtime_enrichment.article.md)
omits the `/ W_in(c)` normalization for brevity; without it shares would not sum
to a meaningful total.)

**Cycles** (recursion, mutual recursion) would make the recurrence circular, so
strongly-connected components are collapsed: their self costs are lumped, the
cycle is propagated as one unit, and every member is reported with the cycle's
total inclusive cost and flagged `cyclic` (`↺`). Self-recursion (a node calling
itself) is captured by self cost and is **not** flagged.

> **Inclusive costs do not sum across nested nodes.** A caller's inclusive cost
> already contains its callees'. Only a *cut* of the graph (e.g. the root
> frontier) sums to the total — `shareOfTotal` is a per-node attribution, not a
> partition of the whole.

## Output — ranking (no `id`)

A header naming the metric and the total self cost (the `shareOfTotal`
denominator), then one ranked line per node: `rank`, inclusive cost,
`share`, `kind`, `name` (`↺` when cyclic), location.

```
Inclusive cost by self-time (total self 17860.614 ms)
 1.   16906.578 ms   94.7%  Function   main  src/main.ts:14
 2.    12982.94 ms   72.7%  Method     headline  src/report/text_report.ts:39
 3.    9131.434 ms   51.1%  Method     titleCase  src/utils/string_utils.ts:20
 ...
```

`main` has almost no self cost, yet it is *responsible* for 94.7% of measured
time — the gap between exclusive ([`hotspots`](hotspots.md)) and inclusive
(`cost`) ranking is exactly the leverage this query surfaces.

## Output — attribution (with `id`)

The focal node's `self` / `inclusive` / `share of total`, then two breakdowns:
**callees** (where the node's inclusive cost goes, each carrying its subtree's
contribution) and **callers** (how the node's cost is attributed upward, by
call-count share).

```
titleCase  Method · src/utils/string_utils.ts:20
  self 5474.126 ms  ·  inclusive 9131.434 ms  ·  share of total 51.1%

Cost flows into (callees)
  ->    2705.166 ms   29.6%  capitalize  src/utils/string_utils.ts:7
  ->     952.142 ms   10.4%  normalizeWhitespace  src/utils/string_utils.ts:15

Attributed to callers
  <-    9131.434 ms  100.0%  headline  src/report/text_report.ts:39
```

The callee shares plus the node's own self share sum to 1 (where its inclusive
cost is spent); the caller shares sum to 1 (who is responsible for it).

## JSON (`--json`)

Ranking — `nodes` is `CostRef[]` (a `SymbolRef` plus `selfCost`,
`inclusiveCost`, `shareOfTotal`, `cyclic`, `cycleSize`); the envelope records the
metric, whether the graph is `enriched`, the `totalSelf` denominator, and the
count of `measuredNodes`. Attribution — `node` (a `CostRef`, or `null` for an
unknown id) plus `callees` / `callers` arrays of `CostFlow` (`SymbolRef` plus
`amount`, `share`, `callCount`).

```bash
npx ts-knowledge-graph cost --json
npx ts-knowledge-graph cost <id> --json
```

## Examples

```bash
# rank the whole graph by inclusive cost / share of total
npx ts-knowledge-graph cost

# the same, ranked by propagated profiler samples instead of self time
npx ts-knowledge-graph cost --by samples --limit 10

# break one node down: where its cost goes, and who is responsible for it
npx ts-knowledge-graph find titleCase --json     # -> get its id
npx ts-knowledge-graph cost <id>

# machine-readable — the shape the optimization agent consumes
npx ts-knowledge-graph cost --json
```

## Notes and caveats

- **Needs [`enrich`](enrich.md).** Cost is inherently a runtime quantity — there
  is no self cost to propagate on an un-enriched graph, so `cost` prints
  `! no runtime data in graph — run \`enrich\` first.` and ranks empty (unlike
  [`hotspots`](hotspots.md), there is no static fallback).
- **Needs a `--semantic` extraction.** Propagation runs over `CALLS` edges, which
  only exist on a semantic graph.
- **Share is of *attributed* self cost.** `totalSelf` is the self cost
  [`enrich`](enrich.md) managed to attach to graph nodes; profile samples that
  could not be joined (reported as dropped by `enrich`) are not in the
  denominator.
- **Static call edges only.** Dynamic dispatch is invisible to the graph, so cost
  cannot flow across a call the extractor could not resolve — confirm a high-share
  candidate with [`who-calls`](who-calls.md) / [`calls`](calls.md).
- **Re-extract before trusting it.** The loader merges by id and does not remove
  stale nodes; for a clean reading, delete the database, re-extract, reload, and
  re-enrich — see [`load`](load.md).

## See also

- [`hotspots`](hotspots.md) — the *exclusive* counterpart: ranks by self time
  (time spent *in* a node) rather than propagated inclusive cost.
- [`enrich`](enrich.md) — attaches the `metadata.runtime` self cost that `cost`
  propagates.
- [`calls`](calls.md) / [`who-calls`](who-calls.md) — the raw edges the
  attribution breakdown is computed over.
