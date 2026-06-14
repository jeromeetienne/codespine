# `references`

List everything that references a symbol or type — calls, type usage, heritage,
instantiation, and value reads. Broader than [`who-calls`](who-calls.md), which
only follows `CALLS`.

Source: [`src/commands/references_command.ts`](../../src/commands/references_command.ts) ·
query: `GraphQuery.references` in
[`src/query/graph_query.ts`](../../src/query/graph_query.ts)

## Synopsis

```bash
npx ts-knowledge-graph references <id> [options]
```

## Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `<id>` | yes | Node id of the symbol or type to inspect. Obtain it from [`find --json`](find.md). |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-o, --output-folder <dir>` | `./outputs` | Output folder; the Kùzu database is read from `<dir>/graph.kuzu`. |
| `--json` | `false` | Emit raw JSON instead of the formatted table. |

## What it does

Returns every node with a **reference-kind** edge pointing **inbound** at the
target:

```cypher
MATCH (n:GraphNode {id: $id})<-[e:Edge]-(other:GraphNode)
WHERE e.kind IN ['CALLS', 'IMPLEMENTS', 'EXTENDS', 'USES_TYPE',
                 'RETURNS', 'PARAM_TYPE', 'INSTANTIATES', 'READS']
RETURN other.*, e.kind AS edgeKind
ORDER BY edgeKind, filePath, startLine
```

### Reference-kind edges

The ten edge kinds that count as a "reference" are:

| Edge | Meaning |
| --- | --- |
| `CALLS` | the symbol is called |
| `IMPLEMENTS` | a class implements this interface |
| `EXTENDS` | a class/interface extends this one |
| `USES_TYPE` | this type is used in a type position |
| `RETURNS` | a function returns this type |
| `PARAM_TYPE` | a parameter has this type |
| `INSTANTIATES` | this class is constructed (`new`) |
| `READS` | this value identifier is read |
| `OVERRIDES` | a method overrides this base member |
| `HANDLES` | an HTTP endpoint is routed to this handler |

Structural, mutation, and the system-level config/HTTP edges — `CONTAINS`,
`IMPORTS`, `EXPORTS`, `WRITES`, `READS_CONFIG`, `CALLS_EXTERNAL` — are deliberately
**not** counted as references. This is the same set
[`dead-exports`](dead-exports.md) uses to decide whether a symbol is unused.

All reference edges require a `--semantic` extraction.

## Output

Formatted (default) — each line shows direction (always inbound, `<-`), the edge
kind, and the referencing symbol:

```
<- CALLS        run         src/store/kuzu_store.ts:49
<- USES_TYPE    load        src/store/kuzu_store.ts:80

2 edge(s)
```

JSON (`--json`) — an array of `NeighborRef` objects: a `SymbolRef` plus
`edgeKind` and `direction` (`"in"`). No references yields `(no neighbours)` /
`[]`.

## Examples

```bash
# every reference to a type alias — calls, type usage, heritage, reads
npx ts-knowledge-graph references 'TypeAliasDeclaration:src/schema/node.ts#GraphNode@37'

# machine-readable
npx ts-knowledge-graph references 'TypeAliasDeclaration:src/schema/node.ts#GraphNode@37' --json
```

## `references` vs related commands

| Question | Command |
| --- | --- |
| Who *calls* this (CALLS only)? | [`who-calls`](who-calls.md) |
| Who references this *in any way* (8 reference kinds)? | `references` |
| Every edge touching this, both directions, all kinds? | [`neighbors`](neighbors.md) |

Use `references` to judge whether a symbol is safe to remove: zero references
(member-aware) is what makes a symbol dead.

## Notes and caveats

- Only static references are captured. Dynamic access (string-keyed lookups,
  reflection) is invisible, so "zero references" means "no static references".
- Empty results may also mean a stale id — re-run [`find`](find.md) to confirm.

## See also

- [`who-calls`](who-calls.md) — the narrower, calls-only view.
- [`dead-exports`](dead-exports.md) — applies this reference set across all exports.
- [`neighbors`](neighbors.md) — all edges, both directions.
