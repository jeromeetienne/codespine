# project_03 — `shapes`

A small 2D geometry hierarchy: an abstract `Shape` base, `Circle` / `Rectangle`
subclasses, a `Square` specialisation of `Rectangle`, and a `Renderable`
interface the shapes implement. It is one of three sample projects used to
exercise [`ts-knowledge-graph`](../../README.md); each sample stresses a
different layer of the graph. **`shapes` targets the type (heritage) layer** —
`EXTENDS`, `IMPLEMENTS`, `USES_TYPE`, `RETURNS`, `PARAM_TYPE`, and
`INSTANTIATES` edges, and the `references` / `neighbors` queries.

## What it contains

`main.ts` and `index.ts` sit at the `src/` root; the rest is grouped into
`shapes/`, `render/`, and `geometry/`.

| File | Exports | Role |
| --- | --- | --- |
| `src/main.ts` | — | runnable example; non-exported `main()` roots the call graph |
| `src/index.ts` | — | public barrel |
| `src/shapes/shape.ts` | `Shape` | abstract base: `abstract area()`, `abstract boundingBox()`, concrete `describe()` |
| `src/shapes/circle.ts` | `Circle` | `extends Shape implements Renderable` |
| `src/shapes/rectangle.ts` | `Rectangle` | `extends Shape implements Renderable` |
| `src/shapes/square.ts` | `Square` | `extends Rectangle` |
| `src/render/renderable.ts` | `Renderable` | the render interface |
| `src/geometry/types.ts` | `Point`, `BoundingBox`, `Diameter` | shared geometry types |

This yields a dense type layer: `EXTENDS` (3), `IMPLEMENTS` (2), `USES_TYPE` (3),
`RETURNS` (3), `PARAM_TYPE`, and `INSTANTIATES` (3) edges.

## Planted optimisations

**Dominant — a redundant override (heritage layer).** `Square extends Rectangle`
and reimplements `area()` with the same `width * height` body as
`Rectangle.area`. Since the `Square` constructor already passes `side` for both
dimensions, the inherited implementation is sufficient and the override can be
deleted.

The graph leads you to it through heritage and member structure:

```
references <Rectangle>   →  Square   (EXTENDS)        # Square specialises Rectangle
find area                →  area in shape / circle / rectangle / square
```

Seeing `Square EXTENDS Rectangle` and that both define `area` flags the
shadowed member; comparing the two bodies confirms the redundancy.

> **Caveat — no `OVERRIDES` edge.** The graph schema declares an `OVERRIDES`
> edge kind, but the current extractor never emits one (it is a roadmap item).
> So the override relationship is surfaced via `EXTENDS` plus the duplicated
> `area` member, **not** a dedicated `OVERRIDES` edge. This sample is a good
> regression fixture for that gap: once the extractor emits `OVERRIDES`,
> `references` on `Rectangle.area` should report `Square.area`.

**Incidental — a dead type alias (`dead-exports`).** `Diameter`
(`src/geometry/types.ts`) is exported but referenced by nothing, so
`dead-exports` reports it (no inbound `USES_TYPE` / `PARAM_TYPE` / `RETURNS`
edge).

## Running it

```bash
# from this directory
npm test             # 9 tests
npm run dev          # the runnable example (src/main.ts)
```

## Exercising it with ts-knowledge-graph

```bash
# from the ts_knowledge_graph repo root
npm run extract -- sample_projects/project_03 --semantic
npm run dev -- load

npm run dev -- dead-exports        # → Diameter

npm run dev -- find Shape
npm run dev -- references <id>     # → Circle, Rectangle  (EXTENDS)

npm run dev -- find Renderable
npm run dev -- references <id>     # → Circle, Rectangle  (IMPLEMENTS)

npm run dev -- find Rectangle
npm run dev -- references <id>     # → Square (EXTENDS) + main (INSTANTIATES)
```
