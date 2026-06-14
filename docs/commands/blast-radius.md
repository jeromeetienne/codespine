# `blast-radius`

List every symbol transitively impacted by changing a node — the full set of
direct and indirect callers. The graph's answer to "if I rewrite this, what
might break?".

Source: [`src/commands/blast_radius_command.ts`](../../src/commands/blast_radius_command.ts) ·
query: `GraphQuery.blastRadius` in
[`src/query/graph_query.ts`](../../src/query/graph_query.ts)

## Synopsis

```bash
npx ts-knowledge-graph blast-radius <id> [options]
```

## Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `<id>` | yes | Node id of the symbol to analyse. Obtain it from [`find --json`](find.md). |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-o, --output-folder <dir>` | `./.ts_knowledge_graph` | Output folder; the Kùzu database is read from `<dir>/graph.kuzu`. |
| `--depth <n>` | `10` | Maximum traversal depth. Clamped to the range `1`–`30`. |
| `--json` | `false` | Emit raw JSON instead of the formatted table. |

## What it does

Runs a variable-length traversal that walks `CALLS` edges **backwards** from the
target, up to `depth` hops, collecting the distinct set of symbols reachable:

```cypher
MATCH (target:GraphNode {id: $id})
      <-[e:Edge*1..<depth> (r, n | WHERE r.kind = 'CALLS')]-
      (impacted:GraphNode)
RETURN DISTINCT impacted.id, impacted.kind, impacted.name,
       impacted.filePath, impacted.startLine
ORDER BY filePath, startLine
```

Conceptually this is [`who-calls`](who-calls.md) applied repeatedly: the direct
callers, then *their* callers, and so on until `depth` hops or the chain ends.
The result is deduplicated (`DISTINCT`), so each impacted symbol appears once no
matter how many call paths reach it.

### Depth clamping

The `--depth` value is sanitized before use (`GraphQuery.clampDepth`):

- A non-numeric value falls back to `5`.
- Values below `1` become `1`.
- Values above `30` are capped at `30`.
- Otherwise the value is floored to an integer.

So `--depth 1` is equivalent to `who-calls`, and very large values are bounded
at 30 hops — Kùzu's maximum upper bound for a variable-length relationship
pattern, above which the query is rejected at bind time.

`CALLS` edges only exist when the graph was extracted with `--semantic`.

## Output

Formatted (default) — one line per impacted symbol (the same shape as `find`):

```
Function       main        src/cli.ts:16
Method         run         src/store/kuzu_store.ts:49

2 result(s)
```

JSON (`--json`) — an array of `SymbolRef` objects. No impacted symbols yields
`(no results)` / `[]`.

## Examples

```bash
# everything transitively impacted if KuzuStore.run changes
npx ts-knowledge-graph blast-radius 'MethodDeclaration:src/store/kuzu_store.ts#run@49' --depth 10

# just the direct callers (equivalent to who-calls)
npx ts-knowledge-graph blast-radius 'MethodDeclaration:src/store/kuzu_store.ts#run@49' --depth 1

# machine-readable, for the optimization agent's safety check
npx ts-knowledge-graph blast-radius 'MethodDeclaration:src/store/kuzu_store.ts#run@49' --json
```

## Notes and caveats

- The traversal follows `CALLS` only. Type-level impact (a changed type rippling
  through `USES_TYPE`/`RETURNS`/`PARAM_TYPE`) is **not** included — use
  [`references`](references.md) for the broader, one-hop reference set.
- Only static call edges are captured; dynamic dispatch is invisible, so a real
  impact set can be larger than what is reported.
- A symbol with no callers returns an empty set even at high depth.

## See also

- [`who-calls`](who-calls.md) — the one-hop version (`depth 1`).
- [`references`](references.md) — broader edge kinds, one hop.
