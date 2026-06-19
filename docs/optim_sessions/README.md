# Optimization Sessions

Exported transcripts of real optimization sessions run against sample projects
with [codespine](../../README.md) and Claude Code. Each file is a full,
unedited session log — the interview that scopes the work, the graph queries
that ground it, and the measured before/after of every change that landed.

They serve two purposes: a worked example of the
[session workflow](#how-to-run-an-optimization-session) below, and a record of
what the code knowledge graph actually surfaced on each project.

## How to run an optimization session

Following [issue #200](https://github.com/jeromeetienne/codespine/issues/200):

1. Copy the code you want to optimize into a repository.
2. Create a `.claude` folder at its root.
3. Install the codespine commands with `npx codespine install`.
4. Launch Claude Code from the repository root.
5. Run [`/codespine-interview`](../commands/) and answer the questions — this
   scopes a concrete, graph-grounded optimization target.
6. Run [`/codespine-optimize`](../commands/) when prompted, or on its own, to
   find and apply a verified-safe optimization.

To keep a record of a session, either ask Claude to *"create a GitHub issue
about this optimization session"*, or export the transcript with
`/export /path/to/file.md` — which is how the logs in this folder were
produced.

## Sessions

### [`session_project03_optim.md`](session_project03_optim.md) — api-brief

A multi-API client (weather, country, FX) with an HTTP stats layer and a
`brief_service` that composes them. Optimized for **maintainability** first,
then **network / request reduction**.

The graph found no dead exports but flagged an oversized 16-node "brief"
community swallowing the whole client hierarchy. The session then scoped a
TTL response cache, locating `BaseApiClient.receive` as the shared chokepoint
and showing why the cache has to gate the `fetch` (not sit inside `receive`)
to actually save requests. Outcome logged as
[issue #201](https://github.com/jeromeetienne/codespine/issues/201) (latency
parallelization) and
[issue #202](https://github.com/jeromeetienne/codespine/issues/202) (the TTL
cache task), with request-count verification via `HttpStats.count()`.

### [`session_project04_optim.md`](session_project04_optim.md) — shop-sqlite

An Express + SQLite shop API with planted inefficiencies. Optimized for
**execution time / latency**, surveyed via a runtime profile rather than
structure alone, then worked as a multi-endpoint campaign:

| Endpoint        | Outcome                                                          |
| --------------- | --------------------------------------------------------------- |
| `GET /stats`    | −61% (indexed two-level aggregation)                            |
| `POST /orders`  | −97.6%, ~41× faster (transaction + batched lookup + WAL/NORMAL) |
| `GET /products` | −99.7%, ~387× (composite index + LIMIT/OFFSET)                  |
| `GET /search`   | result cache (warm 9,901 → 0.4 ms); trigram index assessed & reverted |

Each win is measured wall-clock with byte-identical output, including the
honest negatives — the trigram index that read within noise and was reverted,
and the discovery that the original benchmark was biased toward all-hits
queries. Results posted to
[issue #198](https://github.com/jeromeetienne/codespine/issues/198).
