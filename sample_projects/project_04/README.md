# project_04 — `shop-sqlite`

A small **Express + SQLite website**. It exposes five endpoints (plus a health
probe) backed by a real [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
database on disk. Every endpoint does **genuine CPU and disk/SQL work**, and each
carries one deliberately planted inefficiency — a missing index, an N+1 query, an
fsync storm, JS-side aggregation — so the sample is a ground-truth fixture for
**real CPU, disk, and SQL optimization**.

It replaces the previous `lamp-capacity` *simulation* (which only computed
capacity math and did no I/O). This rewrite is
[ADR 0001](../../docs/adr/0001-dockerized-workload-runner.md) **follow-up #1** —
the I/O-bound sample that makes the Dockerized workload runner's disk limit
meaningful (see [#137](https://github.com/jeromeetienne/ts_knowledge_graph/issues/137)).

## Three things kept separate

| | Lives where | Status |
| --- | --- | --- |
| **Simulation** (analytical CPU/disk model) | the old `src/sim/` | **deleted** |
| **Resource limits** (CPU/memory/disk caps) | the Dockerized runner, via cgroups | **external — never in this source** |
| **Inefficiencies** (missing index, N+1, fsync storm) | the new `src/` | **kept — the optimization targets** |

The application never throttles itself and has no notion of a cap. It just does
honest, deliberately un-optimized work; the runner squeezes it from the outside.

## The endpoints

| Endpoint | Load mix | Planted inefficiency → fix |
| --- | --- | --- |
| `GET /products` | SQL + disk | reads **every** row and sorts on an **unindexed** column, then paginates in JS → index + `LIMIT`/`OFFSET` |
| `GET /products/:id` | CPU + SQL | **re-prepares** the statement on every call → reuse a cached prepared statement |
| `GET /search` | CPU + SQL + disk | leading-wildcard `LIKE` **scans** every row, then ranks/sorts in **JS** → FTS5/index + rank in SQL |
| `POST /orders` | disk + SQL | **N+1** price lookups, per-row inserts, **no transaction** (so `synchronous=FULL` fsyncs each write) → one transaction + batched `IN (...)` + WAL |
| `GET /stats` | SQL + CPU + disk | reads **all** order items and products into JS and joins/groups there → `JOIN … GROUP BY` in SQL |
| `GET /health` | trivial | the cheap control / readiness baseline |

## Deterministic grading, despite noisy disk

The database is a thin instrumented wrapper ([`src/db/database.ts`](src/db/database.ts))
that is the single execution point for every query. It applies the disk-tuning
PRAGMAs and keeps **counters** — `queries`, `rowsRead`, `prepares` /
`prepareCacheHits`, `transactions`. So an optimization is verified by a **counter
delta** (e.g. `POST /orders` going from N+1 to a single batched query, or
`transactions` rising from 0), which is deterministic — independent of the noisy
realism-track timing.

The SQLite knobs are read from `process.env`, with defaults set to the slow,
un-optimized values so the disk optimization has somewhere to start:

| `ConfigFlag` | Default (slow) | Optimized |
| --- | --- | --- |
| `DB_JOURNAL_MODE` | `DELETE` (rollback) | `WAL` |
| `DB_SYNCHRONOUS` | `FULL` (fsync each write) | `NORMAL` |
| `DB_CACHE_SIZE` | `2000` KiB (small) | larger |
| `DB_PATH` | `:memory:` | a file on disk |

## What it contains

| File | Exports | Role |
| --- | --- | --- |
| `src/main.ts` | `main` (not exported) | boots the server (load settings → open + seed DB → listen); the call-graph root |
| `src/app.ts` | `App` | `App.create(db)` registers the six routes (the `Endpoint` / `HANDLES` source) |
| `src/index.ts` | — | public barrel |
| `src/config/settings.ts` | `Settings`, `DatabaseSettings` | reads the SQLite knobs from `process.env` → `ConfigFlag` nodes |
| `src/db/database.ts` | `Database`, `QueryCounters`, `ExecOptions` | instrumented `better-sqlite3` wrapper: PRAGMAs, counters, opt-in statement cache |
| `src/db/seed.ts` | `Seed`, `SeedOptions`, `DEFAULT_SEED_OPTIONS` | deterministic dataset (seeded PRNG; **no secondary indexes**) |
| `src/services/products_service.ts` | `ProductsService` | `list` (unindexed scan + JS pagination), `getById` (re-prepare) |
| `src/services/search_service.ts` | `SearchService` | `LIKE` scan + JS ranking |
| `src/services/orders_service.ts` | `OrdersService` | N+1 + no transaction + fsync storm |
| `src/services/notifier_service.ts` | `OrderNotifier` | guarded outbound webhook `fetch()` — the `ExternalAPI` / `CALLS_EXTERNAL` source |
| `src/services/stats_service.ts` | `StatsService` | JS-side join / group-by |
| `src/routes/*_routes.ts` | `ProductsRoutes`, `SearchRoutes`, `OrdersRoutes`, `StatsRoutes`, `HealthRoutes` | thin Express handlers → services (named methods, so each yields a `HANDLES` edge) |
| `src/types/domain.ts` | `Product`, `ProductPage`, `SearchHit`, `CreateOrderInput`, `CreatedOrder`, `CategorySales`, … | domain type aliases |

It yields **6 `Endpoint` nodes** (`GET /products`, `GET /products/:id`,
`GET /search`, `POST /orders`, `GET /stats`, `GET /health`), **6 `HANDLES` edges**
(every route has a named handler), **6 `ConfigFlag` nodes** (`DB_PATH`,
`DB_JOURNAL_MODE`, `DB_SYNCHRONOUS`, `DB_CACHE_SIZE`, `PORT`, `ORDER_WEBHOOK_ENABLED`),
and **1 `ExternalAPI` node** (`hooks.example.com`) reached by **1 `CALLS_EXTERNAL`
edge** from `OrderNotifier.notifyOrderPlaced`.

### The outbound webhook (the external-API surface)

After an order is created, `OrdersRoutes.create` calls
`OrderNotifier.notifyOrderPlaced`, which `POST`s a summary to
`https://hooks.example.com/orders`. That `fetch` is the project's `ExternalAPI` /
`CALLS_EXTERNAL` source. It is gated by the `ORDER_WEBHOOK_ENABLED` config flag and
off by default, so the deterministic grading workload never makes a real network
call — but because extraction is static, the call site is always in the graph. Set
`ORDER_WEBHOOK_ENABLED=1` to actually send it.

## Running it

```bash
npm install            # express + better-sqlite3 (a native addon)
npm run dev            # boot the server (seeds an in-memory DB by default)
npm test               # node:test suites over the services + counters
npm run typecheck      # tsc --noEmit

# hit it
curl 'http://localhost:3000/products?page=1&pageSize=5'
curl 'http://localhost:3000/search?q=lamp&limit=5'
curl -X POST localhost:3000/orders -H 'content-type: application/json' \
  -d '{"customer":"alice","items":[{"productId":1,"quantity":2}]}'
curl 'http://localhost:3000/stats'
```

To serve from a real file on disk (so writes hit the disk):

```bash
DB_PATH=/tmp/shop.db DB_JOURNAL_MODE=DELETE DB_SYNCHRONOUS=FULL npm run dev
```

## Exercising it with ts-knowledge-graph

The system-level kinds (and the endpoint → handler resolution) need `--semantic`,
which `project04:extract` already passes.

```bash
# from the ts_knowledge_graph repo root
npm run project04:rebuild              # extract --semantic + load

npm run project04:find -- Endpoint     # the five routes + health (find matches by kind)
npm run project04:find -- ConfigFlag   # DB_PATH, DB_JOURNAL_MODE, DB_SYNCHRONOUS, DB_CACHE_SIZE, PORT

# who handles a route?  (HANDLES → handler)
npm run project04:neighbors -- 'Endpoint:GET /search'      # → SearchRoutes.search
# who reads a SQLite knob?  (READS_CONFIG)
npm run project04:neighbors -- 'Config:DB_SYNCHRONOUS'     # → Settings.load

# the planted hot path: enrich with a live CPU profile of the disk-backed workload,
# then rank by measured self-time
npm run project04:enrich
npm run project04:hotspots             # → Database.all / ProductsService.list dominate
```

The workload is a real disk-backed run, so `project04:enrich` →
`project04:hotspots` / `project04:cost` attach and rank measured runtime over the
actual SQL/disk/CPU hot paths.

Or run the whole walk-through at once:

```bash
npm run project04:tour
```

## The workload (companion to [#38](https://github.com/jeromeetienne/ts_knowledge_graph/issues/38))

`scripts/benchmarks/project_04_workload.ts` seeds a database deterministically and
drives the **real service functions** under load. It returns only deterministic
fields (per-endpoint call counts and the query counters), so a fixed seed yields a
byte-identical report and it is usable in the test loop. It lives outside the
extracted source root, so it never becomes a graph node.

```bash
npm run project04:workload
```

## Note on the Docker runner

Because `better-sqlite3` is a **native addon**, the realism-track Docker runner
([`scripts/profile_and_enrich_docker.sh`](../../scripts/profile_and_enrich_docker.sh))
needs this project's Linux-built dependencies inside the container (the native
runner on the host is unaffected). Enforcing the disk cap with
`--device-write-bps` against a writable, block-device-backed volume is
[ADR 0001](../../docs/adr/0001-dockerized-workload-runner.md) follow-ups #2/#3.
