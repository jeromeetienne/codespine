# Wake up to fixed bugs: announcing `issue_autofix`

*An overnight bug-fixing assistant for Claude Code. Label the easy issues, leave
it running, and review one conflict-free pull request per issue in the morning.
It never merges and it never closes an issue — you stay in charge of what lands.*

---

## Outline

1. **The problem** — the backlog of small, well-understood bugs that never reaches the top of anyone's day.
2. **The idea** — label a bug, go home, review a pull request the next morning.
3. **The workflow in four steps** — file, label, run, review.
4. **The three commands** — fix one issue, run the whole queue overnight, or vet the queue first.
5. **How it stays safe** — one pull request per issue, conflict-free by construction; gated on your project's own checks; never merges, never closes.
6. **The label state machine** — `autofix` → `autofixed` or `autofix-failed`.
7. **One night, start to finish** — what an `issue_autofix_session` run actually does.
8. **Getting started** — install as a plugin or copy in the three commands.
9. **The philosophy** — the machine does the drudgery, the human keeps the judgment.

---

## The pile of small bugs

Every project carries a quiet backlog of small bugs. A column that should be
right-aligned. A footer link that points nowhere. An off-by-one in a rarely hit
branch. None of them is hard. Each is well understood the moment you read it. And
yet they sit there for weeks, because the time to switch context, branch, fix,
run the checks, and open a pull request is worth more than the bug costs while it
waits.

`issue_autofix` is a Claude Code plugin built for exactly that pile. You queue
the easy issues with a label, kick the run off at the end of the day, and review
the pull requests in the morning. The boring middle — the branching, the fixing,
the running of checks, the opening of one tidy pull request — happens while you
are away.

## The idea

The whole feature rests on a single promise: **it never merges and it never
closes an issue.** Everything it produces is a proposal. A human reads each pull
request and merges the ones worth keeping. When a pull request merges, its
`Fixes #N` line closes the matching issue; to reject one, you simply close the
pull request and nothing else is affected.

That promise is what makes it comfortable to leave running unattended. The worst
case is a pull request you decline — never a surprise commit on your main branch.

## The workflow in four steps

The everyday loop is built around one label.

1. **File the bug.** Open a GitHub issue describing the problem, just as you
   normally would. Keep the queued ones small and well-scoped: this is for simple
   bugs, not large features.
2. **Queue it.** Add the `autofix` label to any issue you want fixed. Label as
   many as you like; together they form the night's queue.

   *Optional — vet the queue first.* Run `/issue_autofix_validate` to make sure each
   queued issue is defined well enough to fix on its own: it interviews you about
   anything vague, rewrites it (keeping the reporter's original), and parks anything
   still unclear as `autofix-needs-info` so the resolver skips it — a convenience, not
   a gate, so skip it and the run still tries every queued issue.
3. **Kick it off.** At the end of the day, type `/issue_autofix_session` in
   Claude Code, or `/issue_autofix <number>` to fix a single issue right now.
   Leave it running.
4. **Review in the morning.** Each fixed issue has exactly one pull request open
   and is relabeled `autofixed`. Read them, merge the good ones, and anything the
   checks could not satisfy is labeled `autofix-failed` for you to handle by hand.

## The three commands

| Command | What it does |
| --- | --- |
| `/issue_autofix [number]` | Fix one issue. Branch off `main`, make the smallest correct fix, verify it touches no file another open autofix pull request touches, run the project's checks, open a pull request, and label the issue `autofixed`. With no argument it picks the oldest eligible issue. |
| `/issue_autofix_session` | Run the resolver across the whole queue in one sitting — skip (never halt) on a failure or a conflict, track deferrals so it cannot spin, and print a one-line-per-issue summary at the end. |
| `/issue_autofix_validate [number…]` | *Optional pre-flight.* Check that each queued issue is defined well enough to autofix, interview you to fill any gaps, rewrite it (keeping the reporter's original text), and label it `autofix-ready` — or park anything still too vague as `autofix-needs-info`, which the resolver skips. It is the one interactive command, so run it with you present; a run works with or without it. |

The single-issue command is the unit of work, and the session command is the
loop around it. Validation is an optional pre-flight you can run beforehand.

## How it stays safe

Three properties do the heavy lifting.

**One pull request per issue, conflict-free by construction.** Before it runs any
checks, each fix is diffed against every other open `issue_autofix/*` pull
request. If the new fix would touch a file that an already-open autofix pull
request touches, it is *deferred*: the worktree is removed, the issue is left
untouched, and a future night picks it up once the conflicting pull request has
merged. The result is an invariant worth stating plainly — **no two open autofix
pull requests ever touch the same file.** That is what lets you merge them in any
order, or reject any one of them, without the others breaking.

**Gated on your own checks.** A pull request is opened only if the project's
checks pass locally first. The command does not assume a fixed command; it
discovers them. If a `package.json` declares `typecheck` and `test` scripts, it
runs `npm run typecheck` and `npm test`. Otherwise it falls back to the standard
checks for whatever toolchain it finds — `cargo check && cargo test`,
`go vet ./... && go test ./...`, `ruff` / `mypy` / `pytest`, or a `Makefile`
target — or to whatever your `CLAUDE.md`, `README.md`, or CI workflow documents.
If the checks fail, the fix is not shipped: the issue is labeled `autofix-failed`
with the key error pasted into a comment, and the worktree is removed.

**Never merges, never closes.** A human always reviews before anything lands. The
plugin's entire job is to prepare a clean, verified proposal and then stop.

## The label state machine

The `autofix` label is not just a queue marker; it is the heart of the state machine.

| Label | Meaning |
| --- | --- |
| `autofix` | Queue this issue to be fixed. |
| `autofixed` | A pull request is open and awaiting your review. |
| `autofix-failed` | The checks failed; this one needs a human. |

An issue moves from `autofix` to exactly one of two terminal states, and a
deferral leaves no label at all — so the same issue is naturally retried on a
later night, once whatever blocked it has cleared.

## One night, start to finish

When you run `/issue_autofix_session`, here is what unfolds.

It confirms `gh` is authenticated and that a push remote exists; the primary
checkout need not even be clean, since each fix runs in its own worktree. Then it
lists the eligible issues — labeled `autofix`, not yet `autofixed` or
`autofix-failed` — oldest first, and hands the first one to the single-issue
resolver.

For each issue the resolver creates a fresh git worktree off `main` on branch
`issue_autofix/<number>-<slug>`, reads the relevant files, and makes the
smallest change that correctly resolves the issue. It runs the conflict check,
provisions the worktree so it can actually run — installing dependencies from the
project's manifests and copying in local config such as `.env` — and runs the
project's checks. On success it commits, pushes, opens a pull request whose body
carries `Fixes #<number>`, labels the issue `autofixed`, and removes the worktree.

Crucially, **a failure or a conflict never halts the run.** A failed check
records `autofix-failed` and moves on. A file overlap records a deferral and
moves on. The session keeps a record of the issues it deferred this night so it
cannot loop forever on the same conflict — every iteration removes one issue from
consideration, so the queue always shrinks and the run is guaranteed to end.

When the queue is exhausted, it prints a summary: one line per issue, grouped by
outcome, with the totals and a reminder that **nothing was merged.**

```
Autofix session — 2026-06-14
fixed:    #12  right-align numeric columns        → <pull request url>
fixed:    #15  link footer to repo                → <pull request url>
deferred: #14  default output folder              (overlaps #12 on src/cli.ts — retry once #12 merges)
failed:   #18  support multiple languages         (checks failed)
```

## Getting started

You need Claude Code, `git`, and the `gh` CLI authenticated (`gh auth status`)
with push access to the target repository.

Install it as a plugin from the local marketplace:

```bash
git clone https://github.com/jeromeetienne/ts_knowledge_graph
```

Then, in Claude Code:

```
/plugin marketplace add ./ts_knowledge_graph/contribs/issue_autofix
/plugin install issue_autofix@issue_autofix
```

Or copy the three command files into any project's `.claude/commands/` (or your
user-level `~/.claude/commands/`):

```bash
mkdir -p .claude/commands
cp ts_knowledge_graph/contribs/issue_autofix/commands/issue_autofix*.md .claude/commands/
```

They then appear as `/issue_autofix`, `/issue_autofix_session`, and
`/issue_autofix_validate`.

## The philosophy

`issue_autofix` is deliberately modest about what it automates. It does not try
to decide which bugs matter, or to merge its own work, or to take on the large
and ambiguous changes where judgment is the hard part. It takes the small,
well-scoped bugs you have already triaged and removes the tax of acting on them —
the context switch, the branch, the checks, the pull request — while leaving the
one decision that should stay human firmly in your hands: what actually ships.

Queue a few easy issues tonight. Read the pull requests over coffee. Merge the
ones you like.

---

*`issue_autofix` is MIT-licensed and lives at
[`contribs/issue_autofix`](https://github.com/jeromeetienne/ts_knowledge_graph/tree/main/contribs/issue_autofix)
in the `ts_knowledge_graph` repository. © Jerome Etienne.*
