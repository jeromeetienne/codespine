# Blog Series Plan

Tracking issue: [#231](https://github.com/jeromeetienne/codespine/issues/231)

## Decisions

- **Disposition:** replace the existing 8-part internals-heavy series under
  [`docs/blog/`](../blog) entirely. Keep the old `.article.md` files in place
  until the replacements are ready.
- **Audience / goal:** TypeScript developers who might adopt codespine — get
  them to try it.
- **Venue / format:** long-form dev blog, code-heavy and practical.
- **Voice:** first-person developer ("I asked Claude to…"), with codespine as
  the thing that keeps the agent honest. Each post ends with something the
  reader can run.
- **Count:** 8 posts (the full adoption arc).

## Series synopsis

1. **Your AI Agent Is Coding Blind** — The pain, no install yet. I ask Claude to
   refactor; it greps, misses a caller, breaks the build. The pitch: agents need
   a semantic graph, not more grep.
2. **Giving Claude Eyes: Install and Your First Graph** — The 5-minute first win.
   `codespine install`, `extract`, `load`. The `codespine-query` skill answers
   "who calls X" from resolved symbols.
3. **"What Breaks If I Change This?"** — Trust through self-checking. In a real
   edit, Claude uses `blast-radius`, `references`, `dead-exports` to prove impact
   instead of guessing.
4. **From "Optimize This" to a Real Task — `/codespine-interview`** — Scoping a
   vague wish into concrete, measurable tasks anchored to real symbols, without
   touching code.
5. **One Verified-Safe Edit — `/codespine-optimize`** — The core loop. Claude
   finds and applies a single optimization it can prove is safe (the two task
   classes and their proof gates).
6. **Running the Loop — `/codespine-campaign`** — Scale. A ranked, de-risked
   worklist; apply safe wins one at a time, verify each, skip on failure, hand
   back a ledger.
7. **When Do I Need Another Server? Runtime + Workloads** — Making the graph
   causal. The `codespine-workload` skill: cpu-profile and loadtest, attributed
   back onto the graph under a CPU/memory cap.
8. **Seeing Your Codebase — the Webview + Communities** — The visual payoff.
   `webview`, Leiden communities, `/codespine-name-communities`, ending on the
   live demos.

## Next steps

- [ ] Draft Post 1 and lock a template/tone.
- [ ] Produce the remaining 7 posts.
- [ ] Remove or archive the old articles once replacements land.
