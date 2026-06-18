# ADR 0001 — Dockerized workload runner for enforced resource limits

- **Status:** Accepted — runner implemented (see [`scripts/profile_and_enrich_docker.sh`](../../scripts/profile_and_enrich_docker.sh))
- **Date:** 2026-06-17
- **Issue:** [#136](https://github.com/jeromeetienne/ts_knowledge_graph/issues/136)
- **Follows from:** [#135](https://github.com/jeromeetienne/ts_knowledge_graph/issues/135) — *investigate better/cleaner simulation*
- **Supersedes / touches:** the native runner [`scripts/profile_and_enrich.sh`](../../scripts/profile_and_enrich.sh)

## Context

[#135](https://github.com/jeromeetienne/ts_knowledge_graph/issues/135) asked how to
throttle CPU / memory / disk / network for a Node.js workload **without modifying
the source**, on macOS. The investigation's conclusion: **macOS has no cgroups**,
so there is no reliable native per-process *hard* cap. The native knobs
(`taskpolicy`, `cpulimit`, `dnctl`/`pfctl`) are priority-only, port-scoped, or
noisy SIGSTOP/SIGCONT duty-cycling — fine for a rough "does it survive" check,
not for *enforced* limits.

The one place we already have **real, kernel-enforced cgroup limits on macOS** is
the Linux VM behind Docker/podman. This ADR plans a **workload runner** that runs
a sample project's workload inside a container under enforced limits, profiles it,
and feeds the result into the existing `enrich` pipeline — the same pipeline the
native script uses today.

This ADR decides how the runner plugs into *this repo*; the generic mechanics of
each Docker limit are summarised where the decisions need them (§3 disk, §4
network) and condensed in the fidelity table just below.

### Fidelity of Docker resource limits on macOS

Every container runs inside Docker's **Linux VM**, so cgroup limits are enforced
by the *VM's* kernel, not by macOS. That makes most limits accurate and one
(disk) unreliable:

| Resource | Mechanism (Docker flag) | Fidelity on macOS | Note |
| --- | --- | --- | --- |
| CPU | cgroup CFS quota (`--cpus`) | **High** | accurate; pin cores (`--cpuset-cpus`) to cut noise |
| Memory | cgroup memory + OOM (`--memory`) | **High** | set `--memory-swap` = `--memory` to disable swap (harshest, most realistic) |
| Network | `tc`/`netem` in-container, Pumba, Toxiproxy | **High** | small constant latency floor from the macOS↔VM boundary |
| Disk I/O | cgroup blkio (`--device-*-bps`) | **Low** | the container's overlay storage often isn't a real block device the controller can target — the throttle fails to start or silently no-ops (see §3) |

### Two tracks, kept separate (this is the core framing)

| | **Realism track** (this ADR) | **Determinism track** (already exists) |
| --- | --- | --- |
| Question | "Will it hold up on a constrained box (0.5 CPU, 512 MB)?" | "Did my edit make `titleCase` faster?" |
| Wants | Enforced limits; accepts scheduler noise | Low variance; stable median |
| Mechanism | container + cgroups, profile under a cap | `node --cpu-prof` natively, N runs, median + spread |
| Code path | new `scripts/profile_and_enrich_docker.sh` | [`NodeBenchmark.measure`](../../src/benchmark/node_benchmark.ts) / [`benchmark` command](../../src/commands/benchmark_command.ts), labelled **advisory** |
| Used by the agent's before/after deltas? | **No** | Yes |

The benchmark loop deliberately optimizes for *determinism* — it runs the
workload `runs` times and reports `median + spread`, and every delta is stamped
*"advisory — runtime measurement is noisy … not a deterministic guarantee."*
The Docker runner is the opposite end: it intentionally introduces a constraint
and accepts the noise that comes with it. **The Docker path must never become the
benchmark gate**; it answers a different question.

## Decision (summary)

Build a **separate** script, `scripts/profile_and_enrich_docker.sh`, that mirrors
the native script's contract but runs the *profiling step only* inside a
container, then runs `enrich` **on the host** exactly as today:

```bash
bash scripts/profile_and_enrich_docker.sh project_01 --cpus 0.5 --memory 512m
```

The decisive architectural choice is **split the pipeline at the container
boundary**:

```
  host                          container (node:24-slim + tsx)
  ────                          ──────────────────────────────
  write driver into project ──▶ mount project :ro at /work
                                mount $OUT/prof :rw at /prof
  docker run --cpus/--memory ─▶ node --cpu-prof --cpu-prof-dir /prof \
                                     --import tsx /work/._enrich_workload.ts
  newest *.cpuprofile  ◀──────── lands on host via the /prof mount
  tsx src/cli.ts enrich … ─────  (runs on host, unchanged)
  → graph.kuzu
```

**Profile in the container; enrich on the host.** Only the `node --cpu-prof`
invocation needs the cgroup cap. `enrich` reads the `.cpuprofile`, opens the
Kùzu database, and writes `metadata.runtime` — it depends on Kùzu's native addon
and must stay on the host (a macOS-built `node_modules` cannot run in a Linux
container, and we do not want to rebuild it there). This split is what makes the
whole thing simple: the container never touches Kùzu, never needs the repo's
`node_modules`, and runs nothing but `tsx` + pure-TypeScript sample source.

## Decisions on the open questions

### 1. Repo mounting — *mount only the sample project, install the toolchain in the image*

The generated driver imports the project's own `./src/...` (relative to the
driver file) and nothing third-party at runtime (verified: `project_01`–`04`
workloads import only their own source). So the container needs exactly two
things: **the sample project source** and **`tsx`**.

- **Decision:** Bake `tsx` into the image (a cached layer, pinned to the repo's
  `tsx@^4.16.0`), installed at `/opt/runner/node_modules` — **not** under `/work`,
  which is the read-only project mount. The container's working directory is
  `/opt/runner`, so `--import tsx` resolves the loader from there, while the
  driver's `./src/...` imports resolve against its own location under `/work`
  (ESM relative imports are file-relative, independent of cwd). Bind-mount
  **only** the sample project, read-only, at `/work`. Do **not** bind-mount the
  repo's `node_modules`.
- **Why not bind-mount the whole repo / its `node_modules`?** The host
  `node_modules` is macOS-arm64. `tsx` pulls in a platform-specific `esbuild`
  binary, and (more importantly) Kùzu is a native addon — neither runs under the
  container's Linux kernel. Installing `tsx` *in the image* sidesteps the
  arch-mismatch entirely and keeps the run hermetic and cache-friendly. The
  sample projects need no `npm install` of their own (no runtime deps), so there
  is nothing else to stage.

### 2. Profile extraction — *bind-mount `$OUT/prof` and point `--cpu-prof-dir` at it*

- **Decision:** Mount the host's existing per-project profile directory
  (`./.ts_knowledge_graph/<project>/prof`, the same one the native script uses)
  read-write at `/prof`, and pass `--cpu-prof-dir /prof`. The `.cpuprofile`
  lands on the host, byte-identical to the native path, and the host `enrich`
  step consumes it with no change.
- **Caveat (ownership):** on Docker Desktop / OrbStack for Mac the virtiofs
  mount maps file ownership back to the host user, so profiles are not
  root-owned. On **native Linux**, add `--user "$(id -u):$(id -g)"` to the
  `docker run` so the host doesn't get root-owned `.cpuprofile` files.

### 3. Disk-bps device path — *discover at runtime, verify it applied, treat as best-effort*

`--device-read-bps` / `--device-write-bps` need the **VM's** block-device path,
not a host path, and the throttle only attaches if the container's storage is
backed by a real block device the blkio/io controller can target. On Docker
Desktop for Mac that is frequently *not* the case: the container's overlay
filesystem inside the VM isn't a device the controller can attach to, so the run
either fails to start (`failed to write … to blkio.throttle.read_bps_device: no
such device`) or starts with the throttle silently unapplied.

- **Empirical note — this machine runs OrbStack, not Docker Desktop.** The
  active Docker context here is `orbstack` (with `desktop-linux` and `podman
  5.3.1` also installed). OrbStack's storage stack differs from Docker Desktop's,
  so the disk-throttle support and device path must be **probed**, not assumed.
  The CPU/memory path is verified end-to-end on OrbStack; the disk-device probe
  (Appendix B) is still pending and is follow-up #2.
- **Decision:** Never hardcode `/dev/vda`. Mark disk-bps **best-effort / opt-in**
  behind `--device-read-bps` / `--device-write-bps`. The eventual robust form
  discovers the overlay's backing device at container start and **reads the
  cgroup back to confirm the throttle took**, warning (not failing) if it didn't.
- **Implemented as (today):** the runner forwards a *caller-supplied* `dev:bps`
  string straight to `docker run` and prints a no-op warning (no I/O-bound sample
  project exists yet). Auto-discovery + cgroup read-back are deferred to
  follow-up #2 — there is nothing to throttle until follow-up #1 lands.
- **It is a no-op today regardless** (see [§ no-op limits](#what-is-enforced-today-vs-a-no-op)).

### 4. Network shaping — *`tc`/`netem` in-container now; Toxiproxy/Pumba noted for later*

- **Decision:** For the "whole constrained box" goal, use **`tc` + `netem`
  inside the container** (`--cap-add=NET_ADMIN`, `iproute2` in the image). One
  line — `tc qdisc add dev eth0 root netem rate 1mbit delay 200ms loss 5%` —
  shapes the whole NIC with no app changes and no knowledge of upstreams.
- **Why not Toxiproxy?** Toxiproxy degrades **one named upstream** over a proxy.
  The sample workloads have *no* upstream to proxy, so it buys nothing today.
  Keep it (and Pumba, which injects `netem` into a running container with no
  image change) as documented options for when a real-I/O sample project exists.
- **No-op today** (no sample project makes network calls).

### 5. Integration shape — *a separate script, sharing one workload definition*

- **Decision:** Add `scripts/profile_and_enrich_docker.sh` rather than a
  `--docker` flag on the native script.
- **Why:** the native script is a tight, readable `set -euo pipefail` file;
  folding container orchestration + four resource flags into it via a mode branch
  doubles its complexity and risks the working native path. Two scripts also make
  the realism/determinism split self-evident.
- **De-duplicate the workloads.** The per-project workload bodies are *currently
  duplicated* — once as heredocs in [`profile_and_enrich.sh`](../../scripts/profile_and_enrich.sh)
  and again in [`scripts/benchmarks/<project>_workload.ts`](../../scripts/benchmarks).
  Extract the four `workload()` heredoc bodies into a single shared shell
  function (`scripts/lib/workloads.sh`, `source`d by both the native and Docker
  scripts) so there is one source of truth. The Docker script keeps the native
  script's "write driver into the project dir, clean up on `EXIT`" approach
  unchanged — the driver appears in the container through the `/work` mount.

### 6. Determinism caveat — *documented, and enforced by keeping the paths separate*

Covered by the [two-tracks table](#two-tracks-kept-separate-this-is-the-core-framing).
The script prints a one-line banner on every run: *"Realism track: enforced
limits, scheduler noise included. Not the benchmark gate — see ADR 0001."*

### 7. Cross-platform & podman — *drive the Docker CLI surface, with a `CONTAINER_CLI` shim*

- **Decision:** Use `"${CONTAINER_CLI:-docker}"` for every container invocation.
  Works unchanged on Docker Desktop, OrbStack (the active context here), and
  native Linux; podman users set `CONTAINER_CLI=podman` (podman is CLI-compatible
  for `run`/`build` with these flags). Only the device-path discovery (§3) and
  the cgroup read-back are runtime-variant; both are already gated behind probes.

### 8. Base image & caching — *pinned `node:24-slim`, `tsx` as its own layer*

- **Decision:** `FROM node:24-slim` (Debian/glibc — matches the host's
  `node v24.x` and keeps V8/profile behavior close to a typical production
  runtime; Alpine/musl can shift sampling subtly). Pin by digest once chosen.
  Install `iproute2` (for `tc`) and `tsx@^4.16.0` as **separate, cache-stable
  layers** so a normal run rebuilds nothing. Tag the image
  `tkg-workload-runner:node24` and reuse it across runs.

## Worked example, and how it differs from the native path

```bash
# Realism run: profile project_01 pinned to half a core and 512 MB, no swap
bash scripts/profile_and_enrich_docker.sh project_01 --cpus 0.5 --memory 512m
```

What it does, in order:

1. Builds (first time) or reuses `tkg-workload-runner:node24`.
2. Writes the shared `project_01` workload driver into the project dir (host).
3. Runs the container:
   ```bash
   "${CONTAINER_CLI:-docker}" run --rm \
     --cpus 0.5 --memory 512m --memory-swap 512m \
     -v "$PROJ:/work:ro" -v "$PROFDIR:/prof" \
     tkg-workload-runner:node24 \
     node --cpu-prof --cpu-prof-dir /prof --import tsx /work/._enrich_workload.ts
   ```
4. Picks the newest `/prof/*.cpuprofile` (now on the host).
5. Runs `enrich` **on the host**:
   `npx tsx src/cli.ts enrich "$PROFILE" -o "$OUT" --root /work`. The `--root /work`
   matches the in-container frame paths; the join's relative-path resolution then
   maps `/work/src/...` onto the graph's `src/...` nodes (see
   [`runtime_join.ts`](../../src/enrich/runtime_join.ts) `resolveFilePath`).

Expected output — the **same `enrich` report shape** as the native script (real
run, `project_01`, OrbStack):

```
Realism track: enforced limits cpus=0.5 memory=512m. Not the benchmark gate — see docs/adr/0001-dockerized-workload-runner.md.
Profiling project_01 workload in container (tkg-workload-runner:node24 via docker) ...
✓ enriched 7 node(s) with metadata.runtime
  attributed 13844 / 23279 samples (59%), 35723.185 ms self time
  joined 9 frame(s): 9 by name, 0 by range
  dropped 57 frame(s), 9435 sample(s) — not in graph
Top self time
  10442.868 ms  normalizeWhitespace (4245 samples)  utils/string_utils.ts
  10076.59 ms  titleCase (4095 samples)  utils/string_utils.ts
   5074.198 ms  capitalize (1594 samples)  utils/string_utils.ts
```

**How it differs from `scripts/profile_and_enrich.sh project_01`** — the report
*format* is identical (same `enrich`, same nodes attributed), but the numbers
carry the cap. Measured side by side:

| | Native (full CPU) | Docker `--cpus 0.5` |
| --- | --- | --- |
| Self time attributed | 15 087 ms | **35 723 ms** (~2.4×) |
| Wall time | ~26 s @ 100% CPU | ~76 s @ ~½ core |
| Coverage | 62% (9 by name) | 59% (9 by name) |
| Top self-time frame | `titleCase` | **`normalizeWhitespace`** (order shifted) |

The larger self-time, longer wall-time, and the **shifted hot-path ordering** are
the *realism* signal. These numbers are **not** comparable across runs the way
the benchmark median is; do not diff them as a before/after.

## What is enforced today vs. a no-op

Combining the [fidelity table](#fidelity-of-docker-resource-limits-on-macos) with
*today's* (CPU-bound, no-I/O) sample projects:

| Limit | Status in this runner | Reason |
| --- | --- | --- |
| `--cpus` | **Enforced, meaningful today** | CPU-bound workloads; CFS quota is accurate in the VM |
| `--memory` (+ `--memory-swap`) | **Enforced**, but workloads are small | real cgroup cap + OOM kill |
| `--device-*-bps` (disk) | **Plumbed, no-op today** | no sample project does real disk I/O; + Docker-Desktop blkio gap (§3) |
| `tc`/`netem` (network) | **Plumbed, no-op today** | no sample project makes network calls |

The CPU cap is the only limit that *bites* on today's sample projects — which is
fine, because they are CPU-bound and CPU realism is exactly what the agent's
"constrained box" question is about.

## Follow-ups

1. **(Prerequisite, flagged in #135) An I/O-bound sample project.** Disk and
   network limits are no-ops until a sample project does *real* `fs` and socket
   I/O (e.g. a `project_05` that streams files and fetches from a local server).
   Note: `project_04/src/sim/{disk,network}_simulator.ts` are **analytical**
   models — they compute capacity numbers, they do not perform I/O. File this as
   its own issue; it is the unlock for §3 and §4. **Recommend opening it before
   building the disk/network half of the runner.**
   - **Update (#137): addressed for disk/SQL.** `project_04` was rewritten from
     the analytical simulation into a real Express + SQLite (`better-sqlite3`)
     website that performs genuine disk/SQL I/O; the `src/sim/` models are
     deleted. A workload now exists whose un-batched writes actually fsync. Two
     caveats remain: `better-sqlite3` is a **native addon**, so the runner must
     obtain Linux-built project dependencies in the container (the native host
     runner is unaffected), and enforcing `--device-write-bps` against a
     writable, block-device-backed volume is still follow-ups #2/#3. Real socket
     I/O (§4) remains unaddressed.
2. **Run the disk-device probe under OrbStack** (appendix) and record the result;
   decide whether disk-bps ships enabled, warn-only, or Linux-only.
3. **Optional Toxiproxy/Pumba sidecar** once a real upstream dependency exists.

## Acceptance-criteria check (from the issue)

- [x] Short design doc / ADR describing the runner's shape, flags, integration point — *this doc*.
- [x] Decisions on mounting (§1), profile extraction (§2), disk device path (§3), network approach (§4).
- [x] Worked example with expected output and the diff vs. native — *above*.
- [x] Explicit realism-track vs. determinism-track statement — *two-tracks table + §6*.
- [x] Identified follow-up: an I/O-bound sample project — *follow-up #1*.

---

## Appendix A — Dockerfile (sketch)

```dockerfile
FROM node:24-slim
# iproute2 only needed for in-container tc/netem (§4); harmless otherwise.
RUN apt-get update && apt-get install -y --no-install-recommends iproute2 \
    && rm -rf /var/lib/apt/lists/*
# tsx as its own cache-stable layer, pinned to the repo's major version, in a
# fixed dir that is NOT the project mount. The container runs with this as its
# working directory, so `--import tsx` resolves the loader from here; the bind
# mount lands the project at /work and the profile dir at /prof at run time.
WORKDIR /opt/runner
RUN npm init -y >/dev/null && npm install tsx@4
```

## Appendix B — disk-device probe (run once the daemon is up)

```bash
# Which cgroup version, and can blkio/io throttle even attach here?
"${CONTAINER_CLI:-docker}" run --rm node:24-slim sh -c '
  echo "cgroup:"; mount | grep -i cgroup | head -1
  echo "cgroup v2 io.max present:"; ls -l /sys/fs/cgroup/io.max 2>&1
  echo "block devices:"; cat /proc/partitions
  echo "overlay backing:"; findmnt -no SOURCE / 2>&1
'
# Then attempt a real throttle against the discovered device and read it back:
#   docker run --rm --device-write-bps <dev>:1mb node:24-slim sh -c \
#     'cat /sys/fs/cgroup/io.max; dd if=/dev/zero of=/tmp/t bs=1M count=128 oflag=direct'
# If the dd throughput ignores the cap (or the run fails to start), disk-bps is
# unreliable on this backend → ship it Linux-only / warn-only (§3).
```
