# sample_projects

Small, self-contained TypeScript projects used to exercise and test
[`ts-knowledge-graph`](../README.md). See
[issue #21](https://github.com/jeromeetienne/ts_knowledge_graph/issues/21) for
the original motivation.

Each project is deliberately written to **need optimisation**, and the kind of
optimisation differs from one project to the next. That variety is the point:
running `ts-knowledge-graph` across the samples exercises a different layer of the
graph (structural / type / behavioral / system-level) and a different set of query
commands.

## The projects

| Dir | Name | Stresses | Dominant optimisation | Status |
| --- | --- | --- | --- | --- |
| [`project_01`](project_01/) | `text-kit` | Structural layer — `EXPORTS`, `IMPORTS`, `READS` | Dead exports to delete (`dead-exports`) | ✅ done |
| [`project_02`](project_02/) | `calc` | Behavioral layer — `CALLS`, `INSTANTIATES`, `READS`/`WRITES` | Single-use helpers to inline (`who-calls`, `blast-radius`) | ✅ done |
| [`project_03`](project_03/) | `shapes` | Type layer — `EXTENDS`, `IMPLEMENTS`, `OVERRIDES`, `USES_TYPE`, `RETURNS`, `PARAM_TYPE` | Redundant override (`references`, `neighbors`) | ✅ done |
| [`project_04`](project_04/) | `shop-sqlite` | System-level layer — `Endpoint`/`HANDLES`, `ConfigFlag`/`READS_CONFIG`, `ExternalAPI`/`CALLS_EXTERNAL` — plus real CPU + disk/SQL runtime | Real SQL/disk/CPU optimization: missing index, N+1, fsync storm, JS-side aggregation | ✅ done |

Together they cover all four graph layers (structural / type / behavioral /
system-level) and every query command. The first three each also carry one or two
*incidental* secondary optimisations so the samples stay realistic rather than
single-purpose; `project_04` is the system-level fixture for the #31 kinds
(`Endpoint`/`HANDLES`, `ConfigFlag`/`READS_CONFIG`, `ExternalAPI`/`CALLS_EXTERNAL`)
**and** the I/O-bound sample
([ADR 0001](../docs/adr/0001-dockerized-workload-runner.md) follow-up #1) — a real
Express + SQLite (`better-sqlite3`) website whose endpoints do genuine CPU and
disk/SQL work, with planted inefficiencies (missing index, N+1, fsync storm,
JS-side aggregation) and a deterministic service-call workload in
`scripts/benchmarks/project_04_workload.ts` (issue #38).

## Coverage

Measured from the built graphs (`extract --semantic` for every sample, plus
`enrich` for the runtime layer), not by eye. **Every node kind (14/14) and every
edge kind (17/17) is exercised by at least one sample** — the full graph
vocabulary, tracked in
[#145](https://github.com/jeromeetienne/ts_knowledge_graph/issues/145).

**Node kinds**

| Node kind | Exercised by |
| --- | --- |
| `Module`, `Class`, `TypeAlias`, `Function`, `Method`, `Parameter` | all four |
| `Interface` | project_03 |
| `Enum` | project_02 |
| `Property` | project_02, project_03, project_04 |
| `Variable` | project_01, project_02, project_04 |
| `ExternalModule`, `ConfigFlag`, `Endpoint`, `ExternalAPI` | project_04 |

**Edge kinds**

| Edge kind | Exercised by |
| --- | --- |
| `CONTAINS`, `IMPORTS`, `EXPORTS`, `CALLS`, `RETURNS`, `PARAM_TYPE` | all four |
| `USES_TYPE`, `INSTANTIATES` | project_02, project_03, project_04 |
| `READS` | project_01, project_02, project_04 |
| `EXTENDS`, `IMPLEMENTS`, `OVERRIDES` | project_03 |
| `WRITES` | project_02 |
| `READS_CONFIG`, `CALLS_EXTERNAL`, `HANDLES` | project_04 |
| `CALLS_RUNTIME` | any sample, via `enrich` (e.g. `npm run project02:enrich`) |

## What every project contains

A common, predictable shape so the same commands work against each one:

```
project_XX/
├── README.md        # documents the planted optimisations and how to exercise them
├── package.json     # type:module — scripts: dev, test, typecheck
├── tsconfig.json    # ES2020 / NodeNext / strict, includes src + tests
├── src/
│   ├── main.ts      # non-exported main() — the runnable example, and the call-graph root
│   ├── index.ts     # public barrel
│   └── <subfolders> # the rest of the source, grouped into named folders
└── tests/           # node:test suites, run with tsx
```

Per-project scripts:

```bash
cd project_XX
npm run dev          # run src/main.ts
npm test             # npx tsx --test tests/**/*.test.ts
npm run typecheck    # tsc --noEmit
```

### A note on rooting the call graph

A leaf library has no in-graph callers of its own public API, and two things
would otherwise make every export look dead:

- **barrel re-exports** (`index.ts`) are `EXPORTS` edges, which the graph does
  not count as references; and
- **the tests aren't extracted** — `extract` runs against `src/` only
  ([issue #61](https://github.com/jeromeetienne/ts_knowledge_graph/issues/61)),
  so the suites that would otherwise import and exercise the public API never
  enter the graph.

So each project roots its call graph through a **non-exported `main()`** in
`src/main.ts` that drives an internal consumer — mirroring how an application's
entry point keeps its public surface live. This is what makes a query like
`dead-exports` return *exactly* the deliberately planted orphans instead of the
whole public API.

## Exercising a project with ts-knowledge-graph

From the repository root, the quickest path is the per-project **tour** — it
rebuilds the graph from scratch and runs the query tools that project is built to
showcase, against real symbols:

```bash
npm run project01:tour      # structural layer: dead-exports + a single-use helper
npm run project02:tour      # behavioral layer: who-calls (incl. the dead case), calls, blast-radius
npm run project03:tour      # type layer: references / neighbors over EXTENDS / IMPLEMENTS / RETURNS
npm run project04:tour      # system-level + type layer, enrich, and the #38 load-generator verdict
```

Each project also has a `projectNN:*` script family for the individual steps —
`projectNN` (build + dead-exports), `projectNN:rebuild`, `projectNN:extract`,
`projectNN:load`, and one per query command (`:find`, `:who-calls`, `:calls`,
`:references`, `:neighbors`, `:blast-radius`, `:dead-exports`, `:web`). The
id-based ones take an argument after `--`:

```bash
npm run project02:find -- parseParenthesized
npm run project02:who-calls -- '<paste-id-from-find>'
```

All artifacts are written under `./outputs/project_NN/` (gitignored). See each
project's own `README.md` for the exact results to expect.
