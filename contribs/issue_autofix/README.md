# issue_autofix

A Claude Code plugin that fixes simple bugs for you automatically, overnight. Queue
the easy GitHub issues with a label, leave it running, and wake up to one conflict-free
pull request per issue, each gated on your project's own checks. **It never merges and
never closes issues**: the maintainer reviews the PRs in the morning, and each PR's
`Fixes #N` closes its issue on merge.

## Commands

| Command | What it does |
| --- | --- |
| `/issue_autofix [number]` | Fix one issue. In an isolated git worktree off `main`, make the smallest correct fix, verify it touches no file another open autofix PR touches, provision and run the project's checks, open a PR, and label the issue `autofixed`. With no argument it picks the oldest eligible issue. |
| `/issue_autofix_session` | Run the resolver over the whole queue in one go — skip (never halt) on a failure or conflict, track deferrals so it cannot spin, and print a one-line-per-issue summary at the end. |
| `/issue_autofix_validate [number…]` | **Optional pre-flight.** Check each queued issue is defined well enough to autofix; interview you to fill any gaps; rewrite the issue (keeping the reporter's original) and label it `autofix-ready`, or park it as `autofix-needs-info` so the resolver skips it. Interactive — run it with you present. A run works with or without it. |

## Workflow

The everyday loop is built around a single label:

1. **File the bug.** Open a GitHub issue describing the problem, just as you
   normally would. Keep the queued ones small and well-scoped — this is for simple
   bugs, not large features.
2. **Queue it.** Add the `autofix` label to any issue you want fixed. Label as many
   as you like; they form the night's queue.

   *Optional — vet the queue first.* Run `/issue_autofix_validate` to make sure each
   queued issue is defined well enough to fix on its own: it interviews you about any
   that are vague, rewrites them (keeping the reporter's original) and labels the good
   ones `autofix-ready`, and parks anything still too vague as `autofix-needs-info`,
   which the resolver skips. A convenience, not a gate — skip it and the session still
   tries every queued issue.
3. **Kick it off.** At the end of the day, type `/issue_autofix_session` in Claude
   Code (or `/issue_autofix [number]` to fix a single issue now). Leave it running
   overnight.
4. **Review in the morning.** Each fixed issue has one PR open and is relabeled
   `autofixed`. Read the PRs, merge the good ones — `Fixes #N` closes the issue —
   and anything the checks could not satisfy is labeled `autofix-failed` for you to
   handle by hand.

The label is the heart of the state machine: `autofix` → `autofixed` (PR open,
awaiting review) or `autofix-failed` (needs a human). The optional validator adds two
more: `autofix-ready` (vetted) and `autofix-needs-info` (parked, skipped until
clarified). See [Labels](#labels) below.

## How it stays safe

- **One PR per issue, conflict-free by construction.** Before testing, each fix is
  diffed against every other open `issue_autofix/*` PR; if it would touch a shared
  file it is deferred, so the open PRs stay independently mergeable in any order.
- **Gated on real checks.** A PR is opened only if the project's checks pass. The
  command auto-detects them: `npm run typecheck` / `npm test` when a `package.json`
  declares them, otherwise the standard checks for whatever toolchain it finds
  (`cargo`, `go`, `pytest`, a `Makefile`) or whatever `CLAUDE.md` / CI documents.
- **Never merges, never closes.** A human always reviews before anything lands.
- **Isolated, runnable worktree.** Each fix is built and tested in its own git
  worktree, provisioned to actually run — dependencies installed from the project's
  manifests, local config such as `.env` copied in — and verified runnable before
  any result is trusted, so the primary checkout is never disturbed and you can keep
  working while it runs.
- **Optional pre-flight validation.** `/issue_autofix_validate` lets you vet and
  clarify the queue before a run and park anything too vague as `autofix-needs-info`;
  it is a convenience, not a gate — the resolver runs with or without it.

### Labels

| Label | Meaning |
| --- | --- |
| `autofix` | Queue this issue to be fixed. |
| `autofixed` | A PR is open and awaiting review. |
| `autofix-failed` | The checks failed; needs a human. |
| `autofix-ready` | Vetted by `/issue_autofix_validate`. Informational — not required to be picked up. |
| `autofix-needs-info` | Flagged by `/issue_autofix_validate` as too underspecified; parked, and skipped by the resolver until clarified. |

## Install

### As a plugin

This plugin lives in a subfolder, so add it as a local marketplace after cloning:

```bash
git clone https://github.com/jeromeetienne/ts_knowledge_graph
```

Then, in Claude Code:

```
/plugin marketplace add ./ts_knowledge_graph/contribs/issue_autofix
/plugin install issue_autofix@issue_autofix
```

> If you later host `contribs/issue_autofix/` as the root of its own repository,
> the GitHub shorthand `/plugin marketplace add <owner>/<repo>` works directly.

### Manually (copy-in)

Copy the three command files into the `.claude/commands/` of any project (or your
user-level `~/.claude/commands/`):

```bash
mkdir -p .claude/commands
cp ts_knowledge_graph/contribs/issue_autofix/commands/issue_autofix*.md .claude/commands/
```

They then appear as `/issue_autofix`, `/issue_autofix_session`, and
`/issue_autofix_validate`.

## Requirements

- Claude Code
- `git`
- The `gh` CLI, authenticated (`gh auth status`) with push access to the target
  repository.

## License

MIT © Jerome Etienne
