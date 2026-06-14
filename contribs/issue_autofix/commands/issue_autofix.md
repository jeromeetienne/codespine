---
description: Autofix one queued GitHub issue — branch off main, implement the smallest fix, conflict-check it against every other open autofix PR, gate on the project's checks, then open a PR and label the issue 'autofixed'. Never merges.
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Skill
---

# issue_autofix

You take one queued GitHub issue, implement the smallest correct fix on its own
branch, and — only if it passes the checks and overlaps no other open autofix PR
— open a pull request for it. One PR per issue, conflict-free by construction.

You **never merge** and **never close** issues. The maintainer reviews and merges
the PRs in the morning; `Fixes #N` closes each issue on merge.

Use the `gh` CLI for every GitHub interaction. Act autonomously — do not ask the
user questions mid-run.

## Step 1 — Select the issue

If an issue number was passed as an argument (`$ARGUMENTS`), operate on exactly
that issue. Otherwise select the **oldest still-open** issue labelled `autofix`
that has neither `autofixed` nor `autofix-failed`:

```bash
gh issue list --state open --label autofix \
  --search '-label:autofixed -label:autofix-failed sort:created-asc' \
  --json number,title,createdAt --limit 1
```

If nothing matches, report that the queue is empty and stop — do not invent work.

Either way, confirm the chosen issue is open, labelled `autofix`, and not already
`autofixed` or `autofix-failed`; if it is not eligible, report why and stop. Then
read it in full so you understand what is being asked:

```bash
gh issue view <number> --json title,body,comments
```

## Step 2 — Start from a clean main

The working tree must be clean before you start; if it is dirty, stop and say so.
Create a per-issue branch off `main`:

```bash
git switch main
git switch -c "issue_autofix/<number>-<slug>"
```

`<slug>` is a short kebab-case form of the title: lowercase, runs of
non-alphanumeric characters collapsed to single hyphens, trimmed — a few words is
plenty.

## Step 3 — Implement the smallest correct fix

Read the relevant files first so your edits match the existing code and the
conventions in `CLAUDE.md`. Make the smallest change that correctly resolves the
issue; do not bundle unrelated cleanups.

## Step 4 — Conflict avoidance (Way A)

Before testing, make sure your fix touches **no file that any other open autofix
PR already touches**. This invariant is what keeps every autofix PR independently
mergeable in any order, even if PRs pile up unmerged for several days.

```bash
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

Discard cleanly:

```bash
git reset && git checkout -- . && git clean -fd
git switch main && git branch -D "issue_autofix/<number>-<slug>"
```

## Step 5 — Gate on the project's own checks

With no conflict, run the project's checks locally. Discover them from the repo
rather than assuming a fixed command:

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

- **Fail** → this fix is not good enough to ship. Label the issue
  `autofix-failed`, comment what failed (paste the key error), discard the branch
  (commands above), and stop with outcome `failed #<number>`.

  ```bash
  gh label create autofix-failed --description "Autofix attempt failed its checks" --color b60205 2>/dev/null || true
  gh issue edit <number> --add-label autofix-failed
  gh issue comment <number> --body "Autofix attempt failed the project checks (\`<commands you ran>\`):

  <key error output>

  Leaving this for manual review."
  ```

- **Pass** → continue to Step 6.

## Step 6 — Commit, push, open the PR

```bash
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

## Rules

- One issue per run: the single oldest eligible match, unless a number was given.
- Never open a PR that touches a file already touched by another open autofix PR.
- Never open a PR whose project checks did not pass locally.
- Never merge, never close issues — the maintainer does both.
- Label `autofixed` only when a PR was actually opened; label `autofix-failed`
  only when the checks actually failed; a deferral leaves no label.
- Follow the repository's `CLAUDE.md` conventions for any code you write.
