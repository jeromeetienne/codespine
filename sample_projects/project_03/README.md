# project_03 — `shapes`

A small 2D geometry hierarchy: an abstract `Shape` base, `Circle` / `Rectangle`
subclasses, a `Square` specialisation of `Rectangle`, and a `Renderable`
interface the shapes implement. It is one of three sample projects used to
exercise [`ts-knowledge-graph`](../../README.md); each sample stresses a
different layer of the graph. **`shapes` targets the type (heritage) layer** —
`EXTENDS`, `IMPLEMENTS`, `OVERRIDES`, `USES_TYPE`, `RETURNS`, `PARAM_TYPE`, and
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

The graph surfaces it directly through an `OVERRIDES` edge:

```
references <Rectangle.area>   →  Square.area   (OVERRIDES)
```

`references` on `Rectangle.area` reports `Square.area` as the overriding member;
comparing the two bodies confirms the redundancy. The whole hierarchy is wired
the same way — `Circle.area` and `Rectangle.area` `OVERRIDES` the abstract
`Shape.area`, and each shape's `render` `OVERRIDES` the interface method
`Renderable.render` — so `references` on any base member lists the subclasses
that override it.

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

npm run dev -- find area
npm run dev -- references <Rectangle.area id>   # → Square.area (OVERRIDES)
```
