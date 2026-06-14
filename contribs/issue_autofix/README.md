# issue_autofix

A Claude Code plugin that autofixes queued GitHub issues — one conflict-free pull
request per issue, gated on your project's own checks. **It never merges and never
closes issues**: the maintainer reviews the PRs, and each PR's `Fixes #N` closes
its issue on merge.

## Commands

| Command | What it does |
| --- | --- |
| `/issue_autofix [number]` | Fix one issue. Branch off `main`, make the smallest correct fix, verify it touches no file another open autofix PR touches, run the project's checks, open a PR, and label the issue `autofixed`. With no argument it picks the oldest eligible issue. |
| `/issue_autofix_session` | Run the resolver over the whole queue in one go — skip (never halt) on a failure or conflict, track deferrals so it cannot spin, and print a one-line-per-issue summary at the end. |

## How it stays safe

- **One PR per issue, conflict-free by construction.** Before testing, each fix is
  diffed against every other open `issue_autofix/*` PR; if it would touch a shared
  file it is deferred, so the open PRs stay independently mergeable in any order.
- **Gated on real checks.** A PR is opened only if the project's checks pass. The
  command auto-detects them: `npm run typecheck` / `npm test` when a `package.json`
  declares them, otherwise the standard checks for whatever toolchain it finds
  (`cargo`, `go`, `pytest`, a `Makefile`) or whatever `CLAUDE.md` / CI documents.
- **Never merges, never closes.** A human always reviews before anything lands.

### Labels

| Label | Meaning |
| --- | --- |
| `autofix` | Queue this issue to be fixed. |
| `autofixed` | A PR is open and awaiting review. |
| `autofix-failed` | The checks failed; needs a human. |

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

Copy the two command files into the `.claude/commands/` of any project (or your
user-level `~/.claude/commands/`):

```bash
mkdir -p .claude/commands
cp ts_knowledge_graph/contribs/issue_autofix/commands/issue_autofix*.md .claude/commands/
```

They then appear as `/issue_autofix` and `/issue_autofix_session`.

## Requirements

- Claude Code
- `git`
- The `gh` CLI, authenticated (`gh auth status`) with push access to the target
  repository.

## License

MIT © Jerome Etienne
