# dotclaude_folder

The version-controlled source of truth for this project's
[Claude Code](https://claude.com/claude-code) configuration: the slash commands
and the skill that turn the `ts-knowledge-graph` code knowledge graph into an
optimization and code-analysis toolkit.

Claude Code reads a project's configuration from its `.claude/` directory. This
folder is the tracked source; the command and skill files here are mirrored into
`.claude/` so the harness can find them (this README is not — it documents the
folder and is left behind by `install`). Keeping the originals under `dotclaude_folder/` lets them
live in version control and ship in the published npm package, while `.claude/`
holds only generated symlinks.

## Contents

| Path | Kind | Purpose |
| --- | --- | --- |
| [`commands/code-graph-interview.md`](commands/code-graph-interview.md) | Command | Scope a vague optimization wish into measurable, graph-grounded tasks. Read-only; presents tasks, applies nothing. |
| [`commands/code-graph-optimize.md`](commands/code-graph-optimize.md) | Command | Find and apply one verified-safe optimization. |
| [`commands/code-graph-campaign.md`](commands/code-graph-campaign.md) | Command | Work a ranked, de-risked worklist of safe wins, verifying and committing each. |
| [`commands/code-graph-name-communities.md`](commands/code-graph-name-communities.md) | Command | Give detected code communities concise, human-readable names. |
| [`skills/code-graph-query/SKILL.md`](skills/code-graph-query/SKILL.md) | Skill | Query the codebase as a knowledge graph (callers, references, blast radius, dead code, hotspots). |

## Setup

Two ways to make these available to Claude Code:

- **In this repository** — run `npm run symlink:dotclaude`. The
  [`scripts/symlink_dotclaude.sh`](../scripts/symlink_dotclaude.sh) script mirrors
  every leaf file under `dotclaude_folder/` into `.claude/` as a relative symlink.
  It is idempotent and never clobbers a real file at a target path.
- **In another project** — run `npx ts-knowledge-graph install`, which copies the
  bundled commands and the `code-graph-query` skill into that project's `.claude/`
  directory. See the [`install` command](../docs/commands/install.md).

## Prerequisite: build the graph

Every command and the skill query a Kùzu database at
`./.ts_knowledge_graph/graph.kuzu`. If it does not exist, build it once (the
`--semantic` flag is required for the caller and heritage edges that power
`who-calls`, `calls`, and `blast-radius`):

```bash
npx ts-knowledge-graph extract . --semantic   # writes ./.ts_knowledge_graph/graph/*.jsonl
npx ts-knowledge-graph load                   # writes ./.ts_knowledge_graph/graph.kuzu
```

Inside this repository's own checkout, substitute `npm run dev --` for the
`ts-knowledge-graph` binary (for example `npm run dev -- load`).

## Commands

Each command is a Claude Code slash command. The frontmatter of every file
declares its `description`, an `argument-hint`, and the `allowed-tools` the
command may use.

### `/code-graph-interview [focus]`

Interviews you to turn a vague wish ("optimize this") into one or more concrete,
measurable, well-scoped optimization tasks, each grounded in the graph so it
points at real symbols. It walks five steps — dimension, business concern,
measurable target, scope, constraints — then surveys the graph for candidates and
presents a ranked list. Every task is tagged with an **executor-readiness**:
`auto-applicable`, `needs-workload`, or `manual`.

This command is **read-only**: it never edits code and never applies a task. The
optional `[focus]` argument is a starting hint (a dimension, a subsystem, or a
named symbol). Hand the task it presents to `/code-graph-optimize`.

### `/code-graph-optimize [task]`

Finds and applies **one** verified-safe optimization, using the graph to confirm
and bound the blast radius before any edit. It distinguishes two task classes,
held to different proof:

- **Behavior-preserving** (dead-code removal, an equivalent rewrite) — the gate is
  `verify` alone (type-check and tests). The claim earned is "applied safely,
  behavior unchanged".
- **Runtime-improvement** — the gate is `verify` **and** a measured `benchmark`
  improvement against a saved baseline. Without a measured `improved` delta it
  claims no speed-up.

With no `[task]` it defaults to removing one genuinely dead exported symbol. It
applies at most one coordinated change per run and stays inside the blast radius
it enumerated.

### `/code-graph-campaign [max-items]`

Runs a **campaign**: instead of a single edit, it works a ranked, de-risked
worklist the graph produces (`campaign --json`), applies the safe wins one at a
time, verifies each in isolation, and never halts on a single failure. It applies
`auto-applicable` items, applies `needs-workload` items only when a benchmark
workload is available, and never applies `manual` items.

The argument is the maximum number of items to apply (default **5**). Each
verified item is committed on the current branch with a one-line message; the
command does **not** push and does **not** open a pull request. It ends with a
one-line-per-item ledger (applied / skipped / deferred).

### `/code-graph-name-communities [output-folder]`

Names the code communities the project has already clustered with the Leiden
algorithm. Detection happens elsewhere; this command is **only the naming**. There
is no model API call and no key — the agent reads each community's members and
writes a concise, conceptual label back (for example "Whitespace & text
normalization" rather than the structural default `utils · normalizeWhitespace`).

The optional `[output-folder]` selects the knowledge-graph database directory
(default `./.ts_knowledge_graph`). The change is label-only and fully reversible:
re-running `cluster` restores the structural labels.

## Skill

### `code-graph-query`

Answers structural questions about a TypeScript project by querying the semantic
knowledge graph rather than reading or grepping source. Because the graph has
resolved symbols and types, its answers are precise where text search is not.
Claude reaches for this skill — instead of `Grep`/`Glob` — when a question is
about code structure or impact.

| Question | Command |
| --- | --- |
| Who calls this function? | `who-calls <id>` |
| What does this function call? | `calls <id>` |
| What breaks if I change this? | `blast-radius <id> [--depth <n>]` |
| What uses this symbol or type? | `references <id>` |
| Which exports are unused? | `dead-exports` |
| What is this connected to? | `neighbors <id>` |
| Where is runtime actually spent? | `hotspots [--by <metric>]` |
| Which symbols dominate total cost? | `cost [id]` |
| What are the natural module clusters? | `cluster` |
| What should I optimize first? | `campaign` |

Names are not ids: resolve a name with `find <name> --json` first, then pass the
resulting id to the other commands. Always pass `--json` and consume the JSON.
The full reference, including the runtime-aware `enrich`/`hotspots`/`cost` flow,
is in [`skills/code-graph-query/SKILL.md`](skills/code-graph-query/SKILL.md).

## Common workflows

### 1. Answer an impact or dead-code question (read-only)

**Rationale.** Before a rename, deletion, or signature change you need the precise
caller, reference, and blast-radius sets — text search misses type-level and
dynamic uses. The graph resolves symbols, so its answer is exact.

**Steps.**
1. Build the graph if `./.ts_knowledge_graph/graph.kuzu` is missing (see
   [Prerequisite](#prerequisite-build-the-graph)).
2. Resolve the symbol: `npx ts-knowledge-graph find <name> --json`.
3. Ask the structural question with an id from step 2: `who-calls`, `references`,
   `blast-radius`, or `dead-exports` (no id needed).
4. Read the specific call sites the graph points at to make the change.

This is the `code-graph-query` skill; Claude invokes it automatically when a
question is caller-, impact-, or dead-code-shaped.

### 2. Scope a vague optimization wish, then apply one change

**Rationale.** "Make this faster / cleaner" is not actionable. The interview turns
it into measurable, scoped, graph-grounded tasks tagged by how safely they can be
automated; the optimizer then applies one and proves it with a gate.

**Steps.**
1. Build the graph if missing. For an execution-time goal, also make it
   runtime-aware first (workflow 4).
2. Run `/code-graph-interview [focus]` and answer its questions (dimension,
   concern, target, scope, constraints). It presents ranked candidate tasks, each
   tagged `auto-applicable`, `needs-workload`, or `manual`, and applies nothing.
3. Choose a task and run `/code-graph-optimize "<task>"`. It confirms the blast
   radius, makes one coordinated change, and gates on `verify`; a runtime task
   also requires a measured `benchmark` improvement.
4. Review the single applied change.

### 3. Clear a batch of safe wins (campaign)

**Rationale.** Dead-code removals and other bounded, behavior-preserving changes
accumulate. A campaign works a ranked, de-risked worklist, applies and
independently verifies each, commits the wins one per commit, and skips — never
halts on — failures.

**Steps.**
1. Build the graph if missing, and ensure `git status --short` is clean so each
   item commits and reverts cleanly.
2. Run `/code-graph-campaign [max-items]` (default 5). It builds the worklist,
   applies each `auto-applicable` item, runs `verify`, and commits each passing
   item on the current branch.
3. Read the end-of-run ledger. Nothing is pushed and no pull request is opened —
   review the commits, then push them yourself if you want them.

### 4. Make the graph runtime-aware (for execution-time work)

**Rationale.** The static graph cannot tell you where time is actually spent. A V8
CPU profile, joined onto the graph, turns "where should I optimize?" into a ranked
query backed by measured self-time.

**Steps.**
1. Profile a representative workload:
   `node --cpu-prof --cpu-prof-dir ./prof ./your-workload.js`.
2. Enrich the graph:
   `npx ts-knowledge-graph enrich ./prof/<file>.cpuprofile --root <project-root> --json`.
3. Rank: `hotspots --by self-time --json` (leaf cost) and `cost --json`
   (inclusive cost).
4. Feed the hottest symbol into workflow 2 or workflow 3.

### 5. Give code communities human-readable names

**Rationale.** Leiden clustering detects module communities but labels them
structurally (a directory plus a hub symbol). Conceptual names make the web-view
legend and the generated reports readable.

**Steps.**
1. Detect communities if needed: `npx ts-knowledge-graph cluster`.
2. Run `/code-graph-name-communities [output-folder]`. It dumps each community's
   members; the agent decides a concise label per community, writes a
   `{ "<index>": "<label>" }` file, and applies it with `cluster rename`.
3. Confirm the renames. The change is label-only and reversible.

## See also

- [Project README](../README.md) — graph model, architecture, and roadmap.
- [Documentation index](../docs/INDEX.md) — every guide and the full per-command
  reference under [`docs/commands/`](../docs/commands/README.md).
