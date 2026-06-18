# `cluster`

Detect **code communities** — candidate modules and subsystems — with the
**Leiden algorithm**, and attach the community index onto each node as
`metadata.community`. Where [`enrich`](enrich.md) annotates nodes with *runtime*
weight, `cluster` annotates them with *structure*: which symbols form a cohesive
group under the call / type / reference graph.

Leiden (not Louvain) because its refinement phase **guarantees every community it
returns is internally connected** — a "module" that is secretly two disconnected
groups is worse than useless for reasoning about boundaries. It runs the CPM
(Constant Potts Model) quality function from
[`networkanalysis-ts`](https://github.com/neesjanvaneck/networkanalysis-ts), the
TypeScript port of the library by the authors of the Leiden paper.

Source: [`src/commands/cluster_command.ts`](../../src/commands/cluster_command.ts) ·
detector: `CommunityDetector` in
[`src/cluster/community_detector.ts`](../../src/cluster/community_detector.ts) ·
orchestrator: `GraphClusterer` in
[`src/cluster/graph_clusterer.ts`](../../src/cluster/graph_clusterer.ts)

## Synopsis

```bash
npx codespine cluster [detect] [options]       # detect communities (the default action)
npx codespine cluster communities [options]    # list communities + members, ready to name
npx codespine cluster rename --labels <file>   # apply human-readable community labels
```

## Arguments

None. `cluster` clusters the whole graph; its subcommands
([`communities`](#cluster-communities), [`rename`](#cluster-rename)) take no
positional arguments either.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-o, --output-folder <dir>` | `./.codespine` | Output folder; the Kùzu database is read from `<dir>/graph.kuzu`. |
| `--resolution <n>` | `0.1` | CPM resolution — a threshold on a community's average internal edge weight. Higher → more, smaller communities; lower → fewer, larger ones. |
| `--json` | `false` | Emit the clustering report as JSON instead of the formatted summary. |

## What it does

1. **Reads the weighted edges.** Every edge whose kind carries a weight (see
   [Edge weighting](#edge-weighting)) is read with its call-site
   `metadata.count`; the edge's weight is the kind's coefficient × count.
2. **Projects to an undirected graph.** Directed edges are symmetrized — both
   directions of a pair sum onto one undirected edge, so a mutual call counts
   once with the combined weight. Self-loops are dropped.
3. **Runs Leiden (CPM).** Builds a `Network`, runs the Leiden algorithm over
   several random starts, and keeps the partition with the best CPM quality.
   Uniform node weights make the resolution a portable density threshold,
   independent of node degree.
4. **Writes `metadata.community`** — an integer community index — and
   **`metadata.communityLabel`** — a human-readable name derived from the
   community's members (see [Community labels](#community-labels)) — onto each
   clustered node, merging with existing metadata. Only those two keys change, so
   re-running on an unchanged graph is idempotent (parallel to how
   [`enrich`](enrich.md) writes `metadata.runtime`).
5. **Records a clustering manifest** at the graph level (a `GraphMeta` row): the
   algorithm, resolution, community count, CPM quality, and the label of each
   community.

### Edge weighting

The signal each edge kind contributes is a tunable coefficient (in
[`src/cluster/cluster_weights.ts`](../../src/cluster/cluster_weights.ts)); the
effective weight of an edge is `coefficient × metadata.count`:

| Edge kinds | Weight | Why |
| --- | --- | --- |
| `CALLS` | 3 | behavioral coupling — the strongest module signal |
| `CALLS_RUNTIME` | 4 | observed runtime calls (`enrich`), weighted by normalized samples |
| `INSTANTIATES`, `EXTENDS`, `IMPLEMENTS` | 2 | construction + heritage |
| `OVERRIDES`, `WRITES` | 1.5 | overrides and mutation |
| `READS`, `USES_TYPE`, `RETURNS`, `PARAM_TYPE` | 1 | value + type cohesion |
| `CONTAINS` | 0.5 | weak same-file pull |

`IMPORTS` / `EXPORTS` are excluded (module wiring, not coupling), as are the
system-level kinds (their targets are synthesized nodes). Because the strongest
signals are the semantic edges, `cluster` wants a `--semantic` extraction — on a
structural-only graph the only weighted edge is `CONTAINS`, so communities
collapse to files. `CALLS_RUNTIME` contributes only after [`enrich`](enrich.md):
its sample weight is normalized to the hottest runtime edge so it stays on-scale
with the static coefficients, making `cluster` true static + runtime fusion on an
enriched graph.

### Resolution

CPM resolution is a threshold on a community's **average internal edge weight**: a
group is kept as a community only when its members are coupled above
`--resolution`. It is the scale knob — sweep it:

- **lower** (e.g. `0.05`) → fewer, larger modules (subsystems);
- **higher** (e.g. `0.5`–`1`) → more, tighter clusters (down to function groups).

The default `0.1` is tuned for module-scale grouping. The right value tracks the
edge-weight magnitudes above, so re-tune if you change the coefficients.

### Community labels

Leiden numbers communities `0, 1, 2, …`, which says nothing about what each one
*is*. `cluster` also derives a deterministic, human-readable label for every
community from its members (`CommunityLabeler` in
[`src/cluster/community_labeler.ts`](../../src/cluster/community_labeler.ts)),
combining two signals:

- the **dominant directory** the members share — code communities track module
  structure (`src/cluster` → `cluster`); and
- the **hub member** — the symbol with the highest internal (within-community)
  weighted degree, i.e. the node the rest of the community couples to most.

A community confined to one file is named after that file (`array_utils`); one
that concentrates in a directory becomes `<directory> · <hub>`
(`cluster · CommunityDetector`); a scattered one falls back to the hub alone.
Every part is derived from membership, never the ordinal index, so the same group
of symbols earns the same label across the algorithm's stochastic re-runs.
Colliding labels are disambiguated with the hub, keeping the set unique.

This deterministic pass is the always-on baseline and fallback. It names a
community's **location** (its directory and hub symbol); to name its
**responsibility** instead, rename communities in-session with an agent and **no
API key** — see [Naming communities with an agent](#naming-communities-with-an-agent-no-api-key)
(issue [#97](https://github.com/jeromeetienne/codespine/issues/97)). A
model-API labelling pass remains tracked in
[#58](https://github.com/jeromeetienne/codespine/issues/58).

## Output

Formatted (default):

```
✓ assigned 40 node(s) to 13 communities
  resolution 0.1, CPM quality 0.6990
  largest communities: utils · normalizeWhitespace (16), citation (6), legacy_string_utils (4), types (3), text_report (2), constants (2), main (1), array_utils (1)
```

JSON (`--json`) — a `ClusterReport`: `nodesAssigned`, `communityCount`,
`quality`, `resolution`, `sizes` (member count per community, descending), and
`labels` (the label of each community, aligned with `sizes`).

## Naming communities with an agent (no API key)

Leiden's job is to *find* the communities; naming them well is a language task.
The deterministic labels above name a community's **location**. To name its
**responsibility** instead — "Whitespace & text normalization" rather than
`utils · normalizeWhitespace` — `cluster` exposes a two-step handshake that an
agent such as Claude Code drives in-session. There is no model API call and no
key: the CLI emits each community's members, the agent picks the names, and the
CLI writes them back.

### `cluster communities`

A read-only dump of every already-detected community and its members, for the
agent to read and name. Communities are ordered largest first.

```bash
npx codespine cluster communities --json
```

```jsonc
{
  "communityCount": 12,
  "communities": [
    {
      "index": 0,
      "currentLabel": "utils · normalizeWhitespace",
      "size": 16,
      "members": [
        { "name": "normalizeWhitespace", "kind": "Function", "filePath": "src/utils/text.ts" }
        // …
      ]
    }
    // …
  ]
}
```

It reads the `metadata.community` written by detection, so run `cluster` first;
on an unclustered graph it reports `communityCount: 0`.

### `cluster rename`

Applies the agent's names. `--labels` points at a JSON object mapping each
community index (as a string) to its label:

```bash
echo '{ "0": "Whitespace & text normalization", "2": "Legacy string helpers" }' > labels.json
npx codespine cluster rename --labels labels.json --json
```

It writes the labels onto `metadata.communityLabel` for every member and updates
the clustering manifest, so the [`webview`](webview.md) legend and node queries
pick them up with no further change. Unknown indexes are ignored (and reported
under `unknownIndexes`), and a label equal to the current one is skipped — so a
re-run is safe. Because it keys off the persisted community index, run it without
re-detecting in between; a later `cluster` resets labels to the structural
baseline (and may renumber communities).

### The `/codespine-name-communities` command

The bundled
[`/codespine-name-communities`](../../dotclaude_folder/commands/codespine-name-communities.md)
slash command scripts the whole loop — dump → name → apply → confirm — so naming
every community is a single command in Claude Code.

## Inspecting the communities

No query change is needed — `metadata.community` and `metadata.communityLabel`
ride the JSON `metadata` column and are returned by every node query:

```bash
npx codespine find titleCase --json
# → [ { "id": "...", "metadata": { "community": 2, "communityLabel": "utils · normalizeWhitespace", ... } } ]

npx codespine neighbors '<id>' --json   # the community of each neighbour
```

Coloring the [`webview`](webview.md) visualisation by community is planned
([#54](https://github.com/jeromeetienne/codespine/issues/54)).

**Try it on a sample project:**

```bash
npm run project01:rebuild   # build the graph (once)
npm run project01:cluster   # detect communities and attach metadata.community
```

## Notes and caveats

- **Leiden over Louvain.** The refinement phase guarantees every community is
  internally connected; Louvain can leave a community split into disconnected
  pieces. On small or sparse graphs the two agree — the difference shows on
  large, hub-heavy graphs.
- **Direction is discarded.** `CALLS` is directed; the clustering is undirected,
  so both directions sum onto one edge. Flow-direction-sensitive analysis is a
  different tool (e.g. Infomap).
- **Resolution needs tuning.** There is no universal value — `--resolution` is a
  density threshold in the same units as the edge weights. Sweep it for the scale
  of module you want.
- **Stochastic.** The algorithm uses random starts and keeps the best CPM
  quality; the partition is stable in practice but not byte-identical across runs
  unless seeded.
- **It writes to the database.** Unlike the read-only query commands, `cluster`
  mutates `metadata.community`. Re-run it after a fresh [`load`](load.md), since a
  reload rewrites nodes.

## See also

- [`enrich`](enrich.md) — the other annotation pass; attaches `metadata.runtime`,
  the runtime counterpart to this structural pass.
- [`extract`](extract.md) — run with `--semantic` so the `CALLS` / type edges
  `cluster` weights exist.
- [`webview`](webview.md) — serve the graph; community coloring is planned
  ([#54](https://github.com/jeromeetienne/codespine/issues/54)).
