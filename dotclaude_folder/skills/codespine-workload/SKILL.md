---
name: codespine-workload
description: >-
  Benchmark a program in a controlled environment and attribute the cost with the
  code graph. Use when asked to profile under a CPU/memory cap, measure server
  capacity ("how many requests per second before p99/latency breaks an SLO"),
  decide "when do I need more servers", find where runtime is spent under load, or
  run a workload in a constrained "one box" container. Two modes: cpu-profile
  (where the time goes) and loadtest (how much load it takes). Requires the
  codespine CLI; Docker is optional (falls back to running on the host).
---

# codespine-workload

Exercise a program under a chosen environment, then attribute the cost back onto
the code graph. This turns vague runtime questions ("why is it slow?", "how many
requests can it take?", "when do I add a server?") into measured, graph-grounded
answers.

The capability is one idea in three parts — **workload kind × environment ×
attribution**:

- **kind** — `cpu-profile` (loop the hot path) *or* `loadtest` (ramp a running server).
- **environment** — `--host` (uncapped baseline) *or* a container under an enforced
  `--cpus`/`--memory` cap (a realistic "one server" box).
- **attribution** — `cpu-profile` → `enrich` → `hotspots`/`cost` (graph-grounded
  *where the time goes*); `loadtest` → a latency-vs-throughput curve and the knee
  (*how many requests/second before the SLO breaks*).

## When to use this skill

- "Where is the time spent / why is this slow under load?" → **cpu-profile**.
- "How many requests/second can my server handle before p99 crosses my SLO?" → **loadtest**.
- "When do I need another server / how do I size capacity?" → **loadtest**.
- "Will it hold up on a small box (0.5 CPU / 512 MB)?" → either mode, **docker** environment.
- The agent is mid-task in `/codespine-interview` or `/codespine-optimize` and hits a
  `needs-workload` situation (it must *measure* a runtime claim, not guess) → use this.

For deciding *which symbol* matters from an existing profile, use the
`codespine-query` skill (`hotspots`, `cost`). This skill is about *producing* the
measurement in a controlled environment in the first place.

## Realism vs. determinism — the honesty rule

There are two tracks, and they answer different questions. Keep them separate:

- **Determinism track** (the `benchmark` command): low-variance before/after deltas
  for "did my edit make X faster?". Stable median, advisory.
- **Realism track** (this skill, under a cap): "will it hold up on a constrained
  box?". It intentionally introduces a cap and **accepts scheduler noise**. These
  numbers are a capacity *estimate*, **not** a deterministic gate. Never diff two
  realism runs as a pass/fail, and never use a realism number to approve an
  optimization — that is what `benchmark`/`verify` are for.

State this caveat whenever you report realism-track numbers. See
[`reference/two-track.md`](reference/two-track.md) for the full framing.

## Prerequisites

- The **codespine CLI** (`codespine …`, or `npx codespine …`).
- For **cpu-profile attribution**: a built graph at `./.codespine/graph.kuzu`. If it
  is missing, build it once: `codespine extract . --semantic` then `codespine load`.
- For the **docker** environment: a container runtime (Docker Desktop / OrbStack /
  podman). If absent, use `--host`.
- For **loadtest**: the server must be runnable locally and expose a readiness
  endpoint (something that returns 2xx when ready).

## Where artifacts live, and what this skill ships

All per-project artifacts go in the **user's** repo under `./.codespine/workload/`
(gitignorable) — never in the codespine package. This skill ships starting-point
templates next to this file under [`templates/`](templates/):

- [`templates/Dockerfile`](templates/Dockerfile) — a tiny `node:24-slim` runner image (`tsx` + `autocannon`).
- [`templates/cpu_profile_driver.template.ts`](templates/cpu_profile_driver.template.ts) — skeleton for the cpu-profile loop.
- [`templates/loadtest_driver.template.ts`](templates/loadtest_driver.template.ts) — a working HTTP capacity driver; edit the marked block for your endpoints.

Copy the relevant template into `./.codespine/workload/`, then fill in the
`// ==== EDIT FOR YOUR PROJECT ====` block. The rest is generic.

## Mode A — cpu-profile: where does the time go?

1. **Build the graph** if needed: `codespine extract . --semantic && codespine load`.
2. **Scaffold**: copy `templates/cpu_profile_driver.template.ts` to
   `./.codespine/workload/cpu_profile_driver.ts`.
3. **Author the driver**: in the EDIT block, import the project's hot module(s) and
   exercise the real public API in a deterministic loop (no timing, just work). It
   must live *outside* the extracted source root so it never becomes a graph node;
   imports are module-relative.
4. **Run it** — start on the **host** (simplest; uses the project's existing
   `node_modules`):
   ```bash
   mkdir -p .codespine/workload/prof
   node --cpu-prof --cpu-prof-dir .codespine/workload/prof \
     --import tsx .codespine/workload/cpu_profile_driver.ts
   ```
   …or under a **cap** for the "constrained box" answer (see *host vs docker* below).
5. **Enrich** the graph with the profile. `--root` must be the directory you passed
   to `extract` — so the profile's absolute frame paths resolve onto the graph's
   relative node paths. It is usually `.`, but a subdirectory if you extracted one
   (e.g. `--root ./src` if the graph was built from `extract ./src`). If `enrich`
   reports most samples "unattributed", the root is wrong:
   ```bash
   codespine enrich "$(ls -t .codespine/workload/prof/*.cpuprofile | head -1)" --root .
   ```
6. **Read it**: `codespine hotspots --by self-time --json` (the leaves where CPU
   burns) and `codespine cost --json` (which symbols the time is spent *under*).
   Report the top frames, tie them to source, and — if asked — to optimization tasks.

## Mode B — loadtest: how much load can it take?

1. **Learn the server**: find the entrypoint (how it boots, what port), the
   readiness endpoint, and the routes + their request contracts (read the route
   handlers). For a write path, find the durability config (does it fsync?).
2. **Scaffold + author**: copy `templates/loadtest_driver.template.ts` to
   `./.codespine/workload/loadtest_driver.ts` and edit the marked block:
   how to start the server, the readiness path, and `buildRequests()` (your
   endpoint mix). A filled example for a typical REST API is in the template's
   comments.
3. **Run** — host baseline first, then the cap:
   ```bash
   # host (uncapped upper bound):
   SERVER_ENTRY=src/main.ts PORT=3000 DB_PATH=/tmp/app.loadtest.db \
     LOADTEST_PROFILE=mixed LOADTEST_SLO_P99_MS=200 \
     node --import tsx .codespine/workload/loadtest_driver.ts

   # docker (one constrained "server" box — realism):
   docker build -t codespine-workload-runner .codespine/workload
   docker run --rm --cpus 0.5 --memory 512m --memory-swap 512m \
     -v "$PWD:/work:ro" -v "$PWD/.codespine/workload:/opt/runner/wl" \
     -e SERVER_ENTRY=/work/src/main.ts -e SERVER_CWD=/opt/runner \
     -e PORT=3000 -e DB_PATH=/tmp/app.loadtest.db \
     -e LOADTEST_PROFILE=mixed -e LOADTEST_SLO_P99_MS=200 \
     codespine-workload-runner \
     node --import tsx /opt/runner/wl/loadtest_driver.ts
   ```
4. **Read the ramp**: the driver prints a table (offered rps → p50/p99) and the
   knee. **Capacity = the highest sustained rps with p99 under the SLO.** "Time to
   add a server" = steady-state load approaching that number.
5. **Critical**: use a **file-backed** datastore for any write-inclusive profile
   (set `DB_PATH`/equivalent to a file). With an in-memory store, fsync is a no-op
   and write capacity is fictitious.

## Choosing host vs. docker

- **Host** — uncapped, uses the project's own `node_modules`, no container friction.
  The easy starting point and the *upper-bound* baseline. A single-threaded server
  effectively uses ~one core regardless of host core count.
- **Docker** — an enforced cgroup cap is the only way to get a faithful "one
  server" box (macOS has no native per-process hard cap). Use it for the realism
  answer. Co-locate the load client in the container against `127.0.0.1` (avoids the
  host↔VM network-latency floor; the trade-off is the client shares the CPU cap).
  If the project has runtime dependencies with **native addons**, the container
  needs a *Linux* build of them (a macOS-arm64 `node_modules` will not run in the
  Linux VM) — provision them into a volume or install in the image. When that is
  painful, prefer host mode.

Run both and compare: the gap tells you how much of the slowness is the cap (cgroup
throttling + a squeezed page cache) versus the program itself.

## Interpreting and reporting

- Always attach the **realism caveat** to capped numbers (noise; estimate not gate).
- At low offered rates, **p99 is sample-thin** (few requests) — lengthen the step
  duration for a stable tail, and say so.
- A *sharp* knee (throughput plateaus while latency explodes) usually means a
  **serial bottleneck** (e.g. a synchronous DB on one event loop) — more cores will
  not help a single-threaded server; "more servers" means more processes/replicas.
- Tie findings to the graph: `cpu-profile` → name the hot symbols from `hotspots`;
  for a slow endpoint, read its handler → service → datastore path.

## Limitations / when to escalate

This MVP assumes the workload is runnable via `node`/`tsx`. Projects needing a
build step, a non-npm package manager, non-HTTP load, custom readiness, or auth
need the driver/run-command adapted by hand — note that to the user rather than
reporting a bogus number. A future `codespine workload run` / `scaffold` command
will wrap the docker/host orchestration shown above; until then, run it directly.
