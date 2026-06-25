# Blog Series Plan

Tracking issue: [#231](https://github.com/jeromeetienne/codespine/issues/231)

## Decisions

- **Audience / goal:** TypeScript developers who already drive an AI coding
  agent (Claude Code, Cursor, Cline, or anything that can call a CLI) — get them
  to adopt codespine.
- **Agent scope:** agent-agnostic. codespine is the *substrate* — a semantic
  code graph with JSON-in/JSON-out query tools any agent can consume. Claude Code
  and its `/codespine-*` commands are the reference example, not a requirement.
- **Reader stance — important:** the reader never runs the `codespine`
  executable themselves. They always work *through* their AI agent; the agent is
  the one that invokes the CLI. So posts show the conversation ("I asked my agent
  to…", and the agent runs `who-calls` under the hood), never a "now type this in
  your terminal" instruction. CLI commands + `--json` appear only to explain what
  the agent is doing, so a Cursor/Cline reader understands the mechanism.
- **Venue / format:** long-form dev blog. Code-heavy and practical,
  ~1500-2500 words per post. Each post ends with a prompt the reader can hand to
  their own agent — not a shell command.
- **Voice:** first-person, problem-first ("I asked my agent to refactor X; it
  greped, missed a caller, broke the build — here's the fix"). codespine is the
  thing that keeps the agent honest.
- **Count:** 6 posts (the adoption arc, without one-feature-per-post bloat).

## Series synopsis

1. **Your AI Agent Is Coding Blind** — *The problem. No install yet.*
   I ask my agent to rename/refactor a symbol; it greps the codebase, misses a
   caller reached through a type alias, and breaks the build. The diagnosis:
   `grep` is text, but "who calls this?" is a *semantic* question that needs
   symbol + type resolution. The pitch: give the agent a knowledge graph, not
   more regex. Ends with a teaser — the same question answered from resolved
   symbols.

2. **Giving Your Agent Eyes: Your First Code Graph** — *The 5-minute first win.*
   I install codespine and ask my agent a question it used to answer with grep —
   "who calls this?" — and it answers from resolved symbols instead. Behind the
   scenes: `extract` → `load`, two JSONL files in an embedded Kùzu database, and
   query tools that all take `--json`. The adoption beat: because the interface
   is JSON-in/JSON-out, *any* agent can drive it — I show it via the
   `codespine-query` skill in Claude Code, but the shape is portable. Ends with a
   prompt the reader can give their own agent to map a symbol's callers.

3. **"What Breaks If I Change This?"** — *Trust through self-checking.*
   In a real edit, my agent uses `blast-radius`, `references`, and `dead-exports`
   to prove impact instead of guessing. Why the graph is member-aware and counts
   `CALLS`/`USES_TYPE`/`RETURNS`/`READS` edges — so it reports the *two* genuinely
   dead exports, not a pile of false positives. Ends with a prompt: ask your
   agent for the blast radius of your hottest function before you let it touch
   the code.

4. **The Loop That Can't Lie: One Verified-Safe Edit, Then a Campaign** —
   *The core value.*
   find → confirm → edit → **verify** → keep-or-revert. The agent makes exactly
   one change, runs `verify` (type-check **and** tests as a single gate), and the
   edit only stands if verify passes — otherwise `git restore`. On a project with
   no tests it degrades to type-check-only and *says so*. Then scale: `campaign`
   ranks a de-risked worklist and the agent works it one verified edit at a time,
   skipping failures and handing back a ledger.

5. **Making the Graph Causal: Optimize What Actually Costs** — *Measured, not
   guessed.* I ask my agent to "make this faster" and it stops guessing: `enrich`
   reconstructs a runtime layer from a V8 CPU profile (`CALLS_RUNTIME`, including
   dynamic dispatch), attaching measured self-time onto nodes. `hotspots` and
   `cost` then rank by real leverage, and `benchmark` reports a median
   before/after delta (e.g. −57% self-time on `titleCase`). The agent stops
   optimizing cold code and reports impact by its number. Ends with a prompt to
   ask your agent for your codebase's real hotspots.

6. **Seeing Your Codebase: The Webview and Communities** — *The visual payoff
   and the share.* `cluster` runs Leiden (CPM) to detect code communities, the
   webview serves the graph as an interactive, pan/zoom map with runtime
   hotspots, and `/codespine-name-communities` gives each cluster a human label.
   Ends on the live browser demos (text-kit, calc, api-brief, shop-sqlite) — no
   install required to see it.

## Notes for drafting

- Each post should open on a concrete failure or wish, not on codespine.
- The reader interacts only with their agent. Show prompts and the agent's
  reasoning; show CLI commands + `--json` solely to explain what the agent runs
  under the hood, never as a "type this yourself" step.
- Keep Claude Code commands as the demonstrated path, but the underlying CLI is
  what makes it portable to a Cursor/Cline reader.
- Reuse the existing live demos and `docs/images/` assets where they fit.

## Next steps

- [ ] Draft Post 1 and lock a template/tone.
- [ ] Produce the remaining 5 posts.
- [ ] Remove or archive the old internals-heavy articles once replacements land.
