# Two tracks: realism vs. determinism

A workload measurement answers one of two questions. They want opposite things, so
keep them separate and never substitute one for the other.

| | **Determinism track** | **Realism track** (this skill under a cap) |
| --- | --- | --- |
| Question | "Did my edit make X faster?" | "Will it hold up on a constrained box?" |
| Wants | Low variance, stable median | Enforced limits; accepts scheduler noise |
| Mechanism | `node --cpu-prof`, N runs, median + spread | container + cgroup cap, profile/load under it |
| Status of the number | a before/after delta (advisory) | a capacity **estimate** |
| Safe to gate on? | yes — that is its job (`benchmark`/`verify`) | **no** |

## The honesty rules

1. **Never use a realism number as a pass/fail gate.** It carries scheduler noise by
   design. Approving an optimization is the determinism track's job (`benchmark`,
   `verify`). Always attach the caveat when you report a capped number.
2. **Do not diff two realism runs** as if the delta were meaningful — the noise can
   exceed the signal. Use them to find *where* a wall is, not to certify a speed-up.
3. **At low offered rates, p99 is sample-thin.** A handful of requests means the tail
   is one slow request. Lengthen the step duration for a stable p99 and say so.
4. **A file-backed datastore is mandatory for write capacity.** With an in-memory
   store, `synchronous=FULL`/fsync is a no-op and the write path looks free — the
   number is fiction.

## Why a container is needed for an enforced cap

macOS (and Windows) have **no native per-process hard CPU/memory cap** — the native
knobs are priority-only or noisy duty-cycling, not enforced limits. The one place
with real, kernel-enforced cgroup limits is the **Linux VM behind Docker/OrbStack/
podman**. So a faithful "one server = 0.5 CPU / 512 MB box" requires running the
workload in a container with `--cpus`/`--memory`. The host run is the *uncapped
upper bound*; the container run is the *constrained-box realism*. Compare the two:
the gap is how much of the slowness is the cap (cgroup throttling + a squeezed OS
page cache) versus the program itself.

## Co-locating the load client

For `loadtest`, run the load generator **inside the same container**, against
`127.0.0.1`. This avoids the host↔VM network-latency floor that would otherwise
pollute p99. The trade-off: the client shares the CPU cap with the server, so report
the capacity as "client + server on one capped box" and keep the client light.

## Reading a sharp knee

If throughput plateaus while latency explodes over a small rate increase, the server
has a **serial bottleneck** — commonly a synchronous datastore on a single event
loop. Extra CPU cores will not help a single-threaded server: "add a server" then
means "add a process / replica," one per core, behind a load balancer.
