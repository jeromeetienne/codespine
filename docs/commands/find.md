# `find`

Find symbols whose name contains a pattern. This is the entry point for every
other query: it resolves a human-typed name into the node ids that `who-calls`,
`calls`, `references`, `neighbors`, and `blast-radius` require.

Source: [`src/commands/find_command.ts`](../../src/commands/find_command.ts) ·
query: `GraphQuery.find` in
[`src/query/graph_query.ts`](../../src/query/graph_query.ts)

## Synopsis

```bash
npx ts-knowledge-graph find <pattern> [options]
```

## Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `<pattern>` | yes | Substring to search for in symbol names. Case-insensitive. |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-d, --db <path>` | `./outputs/graph.kuzu` | Kùzu database path. |
| `--json` | `false` | Emit raw JSON instead of the formatted table. **Use this to read node ids.** |

## What it does

Runs a substring match over node names:

```cypher
MATCH (n:GraphNode)
WHERE n.kind <> 'Module' AND lower(n.name) CONTAINS lower($pattern)
RETURN n.id, n.kind, n.name, n.filePath, n.startLine
ORDER BY filePath, startLine
LIMIT 50
```

Notable behavior:

- **Case-insensitive substring**, not exact match — `find Store` matches
  `KuzuStore`, `JsonlStore`, and `JsonlReader`'s neighbours alike.
- **`Module` nodes are excluded** — `find` returns declarations (classes,
  functions, methods, types…), not files.
- **Capped at 50 results.** A broad pattern silently stops at 50 matches; narrow
  the pattern if you might be hitting the cap.

## Output

Formatted (default) — one line per match, `kind`, `name`, and `filePath:line`:

```
Class          KuzuStore  src/store/kuzu_store.ts:11
Method         run        src/store/kuzu_store.ts:49

2 result(s)
```

JSON (`--json`) — the full `SymbolRef`, including the `id` you feed to other
commands:

```json
[
  {
    "id": "ClassDeclaration:src/store/kuzu_store.ts#KuzuStore@11",
    "kind": "Class",
    "name": "KuzuStore",
    "filePath": "src/store/kuzu_store.ts",
    "startLine": 11
  }
]
```

If nothing matches, the formatted output is `(no results)` and the JSON output
is `[]`.

## Examples

```bash
# locate a class and see where it lives
npx ts-knowledge-graph find KuzuStore

# get the node id to pass to other commands
npx ts-knowledge-graph find KuzuStore --json

# typical workflow: find an id, then analyze it
id=$(npx ts-knowledge-graph find run --json | jq -r '.[0].id')
npx ts-knowledge-graph who-calls "$id"
```

## Notes and caveats

- The `id` field is the only reliable handle on a symbol. The formatted output
  shows `filePath:line` for humans, but other commands take the full id — always
  copy it from `--json`.
- Ids encode the declaration line and change when code moves. Re-run `find`
  after any re-extraction rather than reusing an old id.

## See also

- [`who-calls`](who-calls.md), [`calls`](calls.md),
  [`references`](references.md), [`neighbors`](neighbors.md),
  [`blast-radius`](blast-radius.md) — all consume the ids `find` produces.
