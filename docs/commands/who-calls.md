# `who-calls`

List the symbols that directly call a given symbol — its immediate callers.

Source: [`src/commands/who_calls_command.ts`](../../src/commands/who_calls_command.ts) ·
query: `GraphQuery.whoCalls` in
[`src/query/graph_query.ts`](../../src/query/graph_query.ts)

## Synopsis

```bash
npx ts-knowledge-graph who-calls <id> [options]
```

## Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `<id>` | yes | Node id of the symbol to inspect (a function or method). Obtain it from [`find --json`](find.md). |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-d, --db <path>` | `./outputs/graph.kuzu` | Kùzu database path. |
| `--json` | `false` | Emit raw JSON instead of the formatted table. |

## What it does

Follows `CALLS` edges **inbound** to the target, one hop:

```cypher
MATCH (caller:GraphNode)-[e:Edge]->(callee:GraphNode {id: $id})
WHERE e.kind = 'CALLS'
RETURN caller.id, caller.kind, caller.name, caller.filePath, caller.startLine
ORDER BY filePath, startLine
```

It returns the **direct** callers only — symbols that contain a call site
targeting `<id>`. It does not follow the chain further; for the full transitive
set of impacted symbols, use [`blast-radius`](blast-radius.md).

`CALLS` edges only exist when the graph was extracted with `--semantic`.

## Output

Formatted (default) — one line per caller:

```
Method         run        src/store/kuzu_store.ts:49
Function       main       src/cli.ts:16

2 result(s)
```

JSON (`--json`) — an array of `SymbolRef` objects (`id`, `kind`, `name`,
`filePath`, `startLine`). No callers yields `(no results)` / `[]`.

## Examples

```bash
# who calls KuzuStore.run, directly?
npx ts-knowledge-graph who-calls 'MethodDeclaration:src/store/kuzu_store.ts#run@49'

# machine-readable, for scripting
npx ts-knowledge-graph who-calls 'MethodDeclaration:src/store/kuzu_store.ts#run@49' --json
```

## `who-calls` vs related commands

| Question | Command |
| --- | --- |
| Who calls this, directly (one hop)? | `who-calls` |
| What does this call, directly? | [`calls`](calls.md) |
| Who is transitively affected if I change this? | [`blast-radius`](blast-radius.md) |
| Everything that references this (not just calls)? | [`references`](references.md) |

## Notes and caveats

- Empty results can mean the symbol genuinely has no callers, or that the id is
  stale — re-run [`find`](find.md) to confirm the id is current.
- Only static call sites are captured. Calls made through dynamic dispatch or
  reflection do not appear.

## See also

- [`calls`](calls.md) — the outbound counterpart.
- [`blast-radius`](blast-radius.md) — transitive callers.
