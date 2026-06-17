---
description: Autofix one queued GitHub issue — in an isolated git worktree off main, implement the smallest fix, conflict-check it against every other open autofix PR, provision and gate on the project's checks, then open a PR and label the issue 'autofixed'. Never merges.
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Skill
---

# issue_autofix

You take one queued GitHub issue, implement the smallest correct fix on its own
branch in an isolated git worktree, and — only if it passes the checks and overlaps
no other open autofix PR — open a pull request for it. One PR per issue,
conflict-free by construction.

You **never merge** and **never close** issues. The maintainer reviews and merges
the PRs in the morning; `Fixes #N` closes each issue on merge.

Use the `gh` CLI for every GitHub interaction. Act autonomously — do not ask the
user questions mid-run.

## Step 1 — Select the issue

If an issue number was passed as an argument (`$ARGUMENTS`), operate on exactly
that issue. Otherwise select the **oldest still-open** issue labelled `autofix`
that has none of `autofix-needs-info`, `autofixed`, or `autofix-failed`:

```bash
gh issue list --state open --label autofix \
  --search '-label:autofix-needs-info -label:autofixed -label:autofix-failed sort:created-asc' \
  --json number,title,createdAt --limit 1
```

If nothing matches, report that the queue is empty and stop — do not invent work.

Either way, confirm the chosen issue is open, labelled `autofix`, and not already
`autofixed` or `autofix-failed`; if it is not eligible, report why and stop. Then
read it in full so you understand what is being asked:

```bash
gh issue view <number> --json title,body,comments
```

## Step 2 — Create an isolated worktree off main

Do the work in a dedicated git worktree, never by switching the primary checkout's
branch. The primary checkout is left untouched — it need not be clean, and a human
can keep working in it while you run.

`<slug>` is a short kebab-case form of the title: lowercase, runs of
non-alphanumeric characters collapsed to single hyphens, trimmed — a few words is
plenty. Create the worktree inside the repository under the git-ignored
`.issue_autofix/worktrees/` directory, on a fresh branch started from the `main` ref:

```bash
primary=$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -1)
slug="<number>-<slug>"
worktree="${primary}/.issue_autofix/worktrees/${slug}"
git worktree add -b "issue_autofix/${slug}" "$worktree" main
cd "$worktree"
```

Branching from the `main` ref means the primary checkout's working-tree state is
irrelevant and there is no clash with the primary checkout already being on `main`.
`.issue_autofix/` is git-ignored, so the worktree never shows up as untracked changes
in the primary checkout, and `git worktree add` creates the intermediate
`.issue_autofix/worktrees/` directories on its own.

Shell state does not persist between separate commands, so this `cd` will not stick
and the variables above will not carry over. Every later step recomputes the paths
the same cwd-independent way and `cd`s in itself: the **primary checkout** is always
the first `git worktree list` entry, and **this issue's worktree** is always
`<primary>/.issue_autofix/worktrees/<number>-<slug>`. Work — edits, install, checks,
commit, push — happens inside the worktree; only worktree *removal* runs from the
primary checkout, since you cannot remove the worktree you are standing in.

## Step 3 — Implement the smallest correct fix

Read and edit the files **under the worktree's absolute path**
(`<primary>/.issue_autofix/worktrees/<number>-<slug>/…`), not the primary checkout, so the
fix lands on the issue branch. Read the relevant files first so your edits match the
existing code and the conventions in `CLAUDE.md`. Make the smallest change that
correctly resolves the issue; do not bundle unrelated cleanups.

## Step 4 — Conflict avoidance (Way A)

Before testing, make sure your fix touches **no file that any other open autofix
PR already touches**. This invariant is what keeps every autofix PR independently
mergeable in any order, even if PRs pile up unmerged for several days.

```bash
primary=$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -1)
cd "${primary}/.issue_autofix/worktrees/<number>-<slug>"

# Files your fix touches:
git add -A
git diff --cached --name-only | sort -u > /tmp/issue_autofix_mine.txt

# Files touched by every OTHER open autofix PR:
> /tmp/issue_autofix_others.txt
for n in $(gh pr list --state open --json number,headRefName \
            --jq '.[] | select(.headRefName | startswith("issue_autofix/")) | .number'); do
  gh pr diff "$n" --name-only >> /tmp/issue_autofix_others.txt
done
sort -u -o /tmp/issue_autofix_others.txt /tmp/issue_autofix_others.txt

# Overlap:
comm -12 /tmp/issue_autofix_mine.txt /tmp/issue_autofix_others.txt
```

If the overlap is **non-empty**, this issue conflicts with an open PR. **Defer
it**: discard the branch and leave the issue untouched — no label — so a future
night can pick it up once the conflicting PR has merged. Report the outcome as
`deferred #<number>`, naming the overlapping file(s) and the PR they belong to,
then stop.

Discard cleanly — remove the whole worktree (this also throws away its installed
dependencies and copied config) and delete the branch:

```bash
primary=$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -1)
cd "$primary"
git worktree remove --force "${primary}/.issue_autofix/worktrees/<number>-<slug>"
git branch -D "issue_autofix/<number>-<slug>"
git worktree prune
```

## Step 5 — Provision the worktree, then gate on its checks

A fresh worktree contains only tracked files; the gitignored runtime state it needs
to actually run — installed dependencies, local config such as `.env` — is absent.
Provision it from the project itself before you trust any check result. This is
project-agnostic: do not assume Node.

Run every command in this step from inside the worktree; since shell state does not
persist between commands, begin each one by entering it:

```bash
primary=$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -1)
cd "${primary}/.issue_autofix/worktrees/<number>-<slug>"
```

**5a — Copy local config and secrets from the primary checkout.** These have no
manifest to regenerate from, so they must be copied, not rebuilt. List what is
ignored-but-present in the primary checkout, then copy the small config/secret
entries (for example `.env`, `.env.local`) into the worktree at the same relative
path; skip large dependency and build directories.

```bash
primary=$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -1)
git -C "$primary" ls-files --others --ignored --exclude-standard -- ':!.issue_autofix'
```

**5b — Install dependencies from the project's manifests.** Rebuild them; do not
copy a dependency tree from the primary checkout, since a borrowed tree can be stale
or carry absolute paths that break when relocated (a Python `.venv` is the classic
case). Detect the install command the same way the gate below detects the check
command — a documented bootstrap (`make setup`, `script/bootstrap`, a devcontainer
`postCreateCommand`, a `package.json` `setup`/`postinstall` script) wins over
guessing; otherwise key off the lockfile or manifest:

| Manifest present | Install command |
| --- | --- |
| `package-lock.json` | `npm ci` |
| `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` |
| `yarn.lock` | `yarn install --frozen-lockfile` |
| `bun.lockb` | `bun install` |
| `poetry.lock` / `pyproject.toml` | `poetry install` (or `uv sync`) |
| `requirements.txt` | `pip install -r requirements.txt` |
| `Gemfile.lock` | `bundle install` |
| `go.mod` | `go mod download` |
| `Cargo.toml` | `cargo fetch` |

If there is no dependency manifest, there is nothing to install — skip this.

**5c — Confirm the worktree is runnable.** If the install command failed (non-zero
exit), the worktree is not provisioned — this is **not** the issue's fault. Do
**not** label the issue: remove the worktree (Step 4's discard block) and report
`could-not-provision #<number>` naming what failed to set up, then stop.

**5d — Gate on the project's own checks.** With a runnable worktree, run the
project's checks. Discover them from the repo rather than assuming a fixed command:

1. If `package.json` has a `typecheck` and/or `test` script, use
   `npm run typecheck` and `npm test` (skip whichever is absent).
2. Otherwise detect the toolchain and use its standard checks, for example
   `cargo check && cargo test` (Rust), `go vet ./... && go test ./...` (Go),
   `ruff check . && mypy . && pytest` (Python), or a `Makefile`'s `check` / `test`
   target.
3. If none of those apply, fall back to whatever the repository documents as its
   checks in `CLAUDE.md`, `README.md`, or the CI workflow under
   `.github/workflows/`.

Run every check you found and treat the whole set as the gate. If you genuinely
cannot find any check command, do **not** ship an unverified fix: treat the gate
as failed and say in the comment that no checks were found.

Distinguish *why* a check fails — the environment, or the fix:

- **Environment failure** → a check cannot even execute: a missing dependency or
  binary, `command not found`, `Cannot find module`, an install error. This is a
  provisioning problem, not a bad fix. Handle it exactly like 5c — no label, remove
  the worktree, report `could-not-provision #<number>`, stop.

- **Fix failure** → a check runs and reports a real failure (type error, failing
  test). This fix is not good enough to ship. Label the issue `autofix-failed`,
  comment what failed (paste the key error), discard the worktree (Step 4's block),
  and stop with outcome `failed #<number>`.

  ```bash
  gh label create autofix-failed --description "Autofix attempt failed its checks" --color b60205 2>/dev/null || true
  gh issue edit <number> --add-label autofix-failed
  gh issue comment <number> --body "Autofix attempt failed the project checks (\`<commands you ran>\`):

  <key error output>

  Leaving this for manual review."
  ```

- **Pass** → continue to Step 6.

## Step 6 — Commit, push, open the PR

From inside the worktree, commit and push the branch, then open the PR:

```bash
primary=$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -1)
cd "${primary}/.issue_autofix/worktrees/<number>-<slug>"
git commit -m "<type>: <summary> (#<number>)"
git push -u origin "issue_autofix/<number>-<slug>"
gh pr create --base main \
  --title "<type>: <summary> (#<number>)" \
  --body "Fixes #<number>

<what changed and why, naming the files>

Checked locally with the project's checks (\`<commands you ran>\`) — all pass."
```

Use a Conventional-Commits type (`fix`, `feat`, `docs`, …). The `Fixes #<number>`
line is what closes the issue when the maintainer merges the PR.

The branch now lives on the remote and the PR references it there, so the local
worktree is no longer needed. Remove it to free its installed dependencies; keep
the branch (the pushed copy backs the PR, the local copy is harmless):

```bash
primary=$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -1)
cd "$primary"
git worktree remove --force "${primary}/.issue_autofix/worktrees/<number>-<slug>"
git worktree prune
```

## Step 7 — Mark the issue handled

Add the `autofixed` label so the issue is not picked again while its PR is open:

```bash
gh label create autofixed --description "Autofix PR is open, awaiting maintainer merge" --color 0e8a16 2>/dev/null || true
gh issue edit <number> --add-label autofixed
```

Do **not** close the issue and do **not** merge the PR.

## Step 8 — Report

Report exactly one outcome for this run:

- `autofixed #<number>` — PR URL, the files changed, and how it was checked.
- `failed #<number>` — what failed.
- `deferred #<number>` — which open PR it overlapped and on which file(s).
- `could-not-provision #<number>` — the worktree could not be made runnable (what
  failed to set up). The issue is left unlabelled, exactly like a deferral.

## Rules

- One issue per run: the single oldest eligible match, unless a number was given.
- Work only in the per-issue worktree; never switch the primary checkout's branch
  or modify its working tree. Always remove the worktree before you exit — on
  success, on failure, on deferral, and on a provisioning problem.
- Never open a PR that touches a file already touched by another open autofix PR.
- Never open a PR whose project checks did not pass locally.
- A check that cannot run is a provisioning problem, not a failed fix: report
  `could-not-provision` and leave the issue unlabelled — never `autofix-failed`.
- Never merge, never close issues — the maintainer does both.
- Label `autofixed` only when a PR was actually opened; label `autofix-failed`
  only when the checks actually failed; a deferral or a provisioning problem leaves
  no label.
- Follow the repository's `CLAUDE.md` conventions for any code you write.
