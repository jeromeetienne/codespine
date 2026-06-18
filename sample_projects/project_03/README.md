# project_03 — `api-brief`

A small client that builds a "trip brief" for a destination by calling three
real, keyless public APIs — weather, country facts, and a currency rate — and
aggregating their responses. It is one of four sample projects used to exercise
[`codespine`](../../README.md); each sample stresses a different part of
the graph. **`api-brief` targets the external-API surface** — the `ExternalAPI`
nodes and `CALLS_EXTERNAL` edges that model talking to the outside world — and the
`find` / `neighbors` / `blast-radius` queries over it.

It replaces the previous `shapes` geometry sample. The heritage layer that
`shapes` used to own (`Interface` / `EXTENDS` / `IMPLEMENTS` / `OVERRIDES`) now
lives in [`project_02`](../project_02/) (the `calc` AST is a class hierarchy); this
sample keeps a client class hierarchy of its own, so it still exercises those
edges, but its reason to exist is the outbound-HTTP surface.

## What it contains

`main.ts` and `index.ts` sit at the `src/` root; the rest is grouped into
`clients/`, `brief/`, `http/`, and `types/`.

| File | Exports | Role |
| --- | --- | --- |
| `src/main.ts` | — | runnable example; non-exported `main()` roots the call graph |
| `src/index.ts` | — | public barrel |
| `src/clients/api_client.ts` | `ApiResource`, `BaseApiClient` | the `Interface` + abstract base every client `implements` / `extends` |
| `src/clients/weather_client.ts` | `WeatherClient` | Open-Meteo — current weather (`api.open-meteo.com`) |
| `src/clients/country_client.ts` | `CountryClient` | World Bank — country profile (`api.worldbank.org`) |
| `src/clients/fx_client.ts` | `FxClient` | Frankfurter — EUR→USD rate (`api.frankfurter.app`) |
| `src/brief/brief_service.ts` | `BriefService` | aggregates the three clients into one `TripBrief` |
| `src/http/http_stats.ts` | `HttpStats` | module-level outbound-request counter (deterministic grading) |
| `src/types/domain.ts` | `Weather`, `Country`, `FxRate`, `TripBrief` | the domain types |

Each client owns its `fetch` call with a **static URL**, so the graph names the
host: it yields **three `ExternalAPI` nodes** (`api.open-meteo.com`,
`api.worldbank.org`, `api.frankfurter.app`) and **three `CALLS_EXTERNAL` edges**,
one from each client method — a richer outbound surface than `project_04`'s single
host. The client hierarchy also yields `Interface` (`ApiResource`), `IMPLEMENTS`,
`EXTENDS` (3), and `OVERRIDES` edges, and `BriefService` `INSTANTIATES` the three
clients.

## Planted optimisation

**Dominant — serialised awaits (runtime + behavioral layer).** `BriefService.brief`
awaits the three upstream calls one after another even though they are
independent, so their round-trip latencies add up. Replacing the serial `await`s
with `Promise.all` collapses three sequential round-trips into one.

```ts
const country = await new CountryClient().lookup();
const weather = await new WeatherClient().current();   // waits on country first
const fx = await new FxClient().latest();               // waits on weather first
```

The graph shows it as **three `CALLS_EXTERNAL` edges rooted at `brief`** (one per
host); `enrich` → `hotspots` / `cost` show the serialised wall-clock. The
`HttpStats` request counter makes the effect measurable without depending on real
network timing.

## Running it

```bash
# from this directory
npm test             # 4 tests (the upstream APIs are stubbed)
npm run dev          # the runnable example — hits the real APIs (needs network)
npm run typecheck    # tsc --noEmit
```

`npm run dev` calls the live public APIs; offline, it prints the failure instead
of crashing. The tests and the profiling workload stub `fetch`, so they are
deterministic and need no network.

## Exercising it with codespine

The external-API kinds need `--semantic`, which `project03:extract` already passes.

```bash
# from the codespine repo root
npm run project03:rebuild              # extract --semantic + load

npm run project03:find -- ExternalAPI  # the three upstream hosts (find matches by kind)

# who reaches a host?  (CALLS_EXTERNAL → the client method)
npm run project03:neighbors -- 'Api:api.open-meteo.com'    # → WeatherClient.current

# the aggregator’s call graph
npm run project03:find -- brief
npm run project03:who-calls -- '<paste-id>'                # → main
npm run project03:blast-radius -- '<paste-id>' --depth 10  # → down to the fetch call sites

# the planted hot path under a stubbed-offline profile
npm run project03:enrich
npm run project03:hotspots
```

Or run the whole walk-through at once with `npm run project03:tour`.
