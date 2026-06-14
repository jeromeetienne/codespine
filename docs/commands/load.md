# `load`

Load a JSONL graph (produced by [`extract`](extract.md)) into an embedded Kùzu
database — the second stage of the pipeline. Every query command, the
optimization agent, and the web visualisation read from the database this
command writes.

Source: [`src/commands/load_command.ts`](../../src/commands/load_command.ts)

## Synopsis

```bash
npx ts-knowledge-graph load [options]
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-o, --output-folder <dir>` | `./.ts_knowledge_graph` | Output folder. Reads the JSONL graph from `<dir>/graph/` and writes the Kùzu database to `<dir>/graph.kuzu`. |

## What it does

1. Resolves `--output-folder`, deriving the graph directory (`<dir>/graph/`) and database path (`<dir>/graph.kuzu`).
2. `JsonlReader.read` reads `nodes.jsonl` and `edges.jsonl` from `<dir>/graph/` and
   validates every record against the Zod schemas in
   [`src/schema`](../../src/schema). Malformed records fail loudly here rather
   than corrupting the database.
3. Constructs a `KuzuStore` at the database path and calls `initSchema()`, which
   creates the `GraphNode` node table and `Edge` relationship table if they do
   not already exist.
4. `store.load(nodes, edges)` inserts the validated records into Kùzu.
5. Closes the store and prints how many nodes and edges were loaded.

[Kùzu](https://kuzudb.com) is an embedded graph database (no server process),
queried with Cypher. The database lives entirely in `<dir>/graph.kuzu`.

## Output

```
Loading /…/.ts_knowledge_graph/graph into /…/.ts_knowledge_graph/graph.kuzu ...
✓ loaded ~390 nodes, ~1.3k edges
```

(Counts are illustrative and vary with the codebase and version.)

## Examples

```bash
# load the default output folder (./.ts_knowledge_graph)
npx ts-knowledge-graph load

# load from a custom output folder
npx ts-knowledge-graph load -o ./.ts_knowledge_graph/self
```

## Notes and caveats

- **The loader merges by node id; it does not remove stale nodes.** If you
  re-extract a codebase that has changed, nodes from a previous extraction that
  no longer exist are *not* deleted from the database. For a clean state, delete
  the database directory and reload:

  ```bash
  rm -rf .ts_knowledge_graph/graph.kuzu
  npx ts-knowledge-graph extract . --semantic
  npx ts-knowledge-graph load
  ```

- The database directory can be held open by another process (for example a
  running [`webview`](webview.md) server). Stop other readers before reloading. If Kùzu
  reports errors about the directory — or the database is from an incompatible
  Kùzu version — delete it and reload.
- Every command defaults `-o, --output-folder` to `./.ts_knowledge_graph`, so if you
  load to the default folder you can omit `-o` everywhere else.

## See also

- [`extract`](extract.md) — produce the JSONL graph this command loads.
- [`find`](find.md) — the first query to run once the database is loaded.
