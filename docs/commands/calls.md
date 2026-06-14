# `calls`

List the symbols that a given symbol calls directly — its immediate callees.
The outbound counterpart of [`who-calls`](who-calls.md).

Source: [`src/commands/calls_command.ts`](../../src/commands/calls_command.ts) ·
query: `GraphQuery.calls` in
[`src/query/graph_query.ts`](../../src/query/graph_query.ts)

## Synopsis

```bash
npx ts-knowledge-graph calls <id> [options]
```

## Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `<id>` | yes | Node id of the symbol to inspect (a function or method). Obtain it from [`find --json`](find.md). |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-o, --output-folder <dir>` | `./.ts_knowledge_graph` | Output folder; the Kùzu database is read from `<dir>/graph.kuzu`. |
| `--json` | `false` | Emit raw JSON instead of the formatted table. |

## What it does

Follows `CALLS` edges **outbound** from the target, one hop:

```cypher
MATCH (caller:GraphNode {id: $id})-[e:Edge]->(callee:GraphNode)
WHERE e.kind = 'CALLS'
RETURN callee.id, callee.kind, callee.name, callee.filePath, callee.startLine
ORDER BY filePath, startLine
```

It returns the symbols invoked from inside `<id>`'s body — its direct
dependencies in the call graph. This is the mirror image of
[`who-calls`](who-calls.md): same edge kind, opposite direction.

`CALLS` edges only exist when the graph was extracted with `--semantic`.

## Output

Formatted (default) — one line per callee:

```
Method         initSchema  src/store/kuzu_store.ts:30
Method         close       src/store/kuzu_store.ts:120

2 result(s)
```

JSON (`--json`) — an array of `SymbolRef` objects. No callees yields
`(no results)` / `[]`.

## Examples

```bash
# what does Cli.run call?
npx ts-knowledge-graph calls 'MethodDeclaration:src/cli.ts#run@16'

# machine-readable
npx ts-knowledge-graph calls 'MethodDeclaration:src/cli.ts#run@16' --json
```

## Notes and caveats

- Only direct (one-hop) callees are returned; the command does not recurse into
  what those callees call.
- Only static call sites are captured — calls through dynamic dispatch or
  reflection do not appear.

## See also

- [`who-calls`](who-calls.md) — the inbound counterpart (who calls this).
- [`neighbors`](neighbors.md) — all one-hop edges, not just `CALLS`.
