# Capacity test — how many requests can one server take?

Answers *"how many requests/second can the project_04 server handle before p99
latency climbs past my SLO, i.e. when do I need another server?"* by booting the
real Express + better-sqlite3 server inside a container pinned to a fixed CPU/memory
box ("one server"), ramping a concurrent HTTP load, and reporting the knee.

This is the **realism track** of [ADR 0001](../../docs/adr/0001-dockerized-workload-runner.md):
the cgroup cap is real, the numbers carry scheduler noise, and they are a capacity
*estimate* — **not** the deterministic benchmark gate. It is a different instrument
from the profiling runner (`scripts/profile_and_enrich_docker.sh`), which measures
CPU self-time, not request throughput.

## Run it

```bash
# Mixed load (reads + ~10% order writes) on a 0.5 CPU / 512 MB box, p99 < 200 ms:
npm run project04:loadtest
# or, equivalently, with knobs:
bash scripts/loadtest_docker.sh project_04 --cpus 0.5 --memory 512m \
  --profile mixed --slo-p99 200 --start-rate 10 --step-rate 20 --max-rate 1000

# Read-only load (no fsync write path):
npm run project04:loadtest:read
```

Output is a ramp table plus a one-line verdict, e.g.:

```
offered  achieved      p50       p99   non2xx  timeouts  verdict
     10        10      4.2      18.0        0         0  OK
     30        30      6.1      41.0        0         0  OK
     50        49     22.0     210.0        0         0  OVER SLO

CAPACITY: ~30 req/s sustained at p99 <= 200 ms (profile=mixed).
p99 first crosses the SLO at ~50 offered rps. Provision so steady-state load
stays below this; cross it and you need another server.
```

A JSON report is written to `.codespine/project_04/loadtest/loadtest_<profile>.json`.

## What it does, and the two things that shape the number

1. **The DB is synchronous.** `better-sqlite3` blocks the Node event loop on every
   query, so on a capped box the server does DB work effectively *serially* — the
   latency-vs-rps curve has a sharp knee and capacity ≈ `1 / mean_per_request_db_time`.
2. **`DB_PATH` is set to a real file** (not the code's `:memory:` default), so
   `POST /orders` actually fsyncs. Without this the write capacity would be fiction.
   This is a runtime flag only — **no source is changed** (measure-only).

The load client runs in-process against `127.0.0.1` to avoid the macOS↔VM
network-latency floor; the trade-off is that it shares the CPU cap with the server.

## Pieces

- `loadtest_driver.ts` — boots the server, ramps the load with autocannon, reports.
- `Dockerfile` — `node:24-slim` + `tsx` + `autocannon` (image `tkg-loadtest-runner:node24`).
- `../loadtest_docker.sh` — builds the image, provisions project_04's Linux deps
  (shared with the profiling runner), and runs the driver under the cgroup cap.
