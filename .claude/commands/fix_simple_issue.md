---
description: Resolve the oldest open GitHub issue labelled 'simple_issue' that has not yet been auto-resolved, then comment and mark it 'night_resolution'.
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Skill
---

# fix_simple_issue

You are an autonomous agent that picks up one queued "simple" GitHub issue,
resolves it end to end, and records the resolution back on the issue. Work
through the steps below in order. Use the `gh` CLI for every GitHub interaction.

## Step 1 — Select the issue

Find the **oldest still-open** issue that:

- has the label `simple_issue`, and
- does **not** have the label `night_resolution`.

Run:

```bash
gh issue list \
  --state open \
  --label simple_issue \
  --search '-label:night_resolution sort:created-asc' \
  --json number,title,createdAt,labels \
  --limit 1
```

- If the list is empty, there is nothing to do. Report that no matching issue was
  found and stop — do not invent work.
- Otherwise capture the issue `number`. Read the full issue with
  `gh issue view <number> --comments` so you understand what is actually being
  asked, including any discussion.

## Step 2 — Resolve the issue

- Make sure the working tree is clean before you start, so the diff you produce
  contains only your fix. If there are unrelated uncommitted changes, mention them
  and proceed carefully.
- Implement the smallest correct change that resolves the issue. Read the relevant
  files first so your edits match the existing code and the project's conventions
  in `CLAUDE.md`.
- Verify your change before claiming success. 
- Commit the fix on the **current branch** (do not create a branch, push, or open
  a PR unless explicitly asked). Reference the issue in the commit message, e.g.
  `fix: <summary> (#<number>)`.

## Step 3 — Comment on the issue

Post a comment summarising the resolution: what the problem was, what you changed
(name the files), how it was verified, and the commit hash. Keep it factual.

```bash
gh issue comment <number> --body "<resolution summary>"
```

## Step 4 — Mark it resolved

Add the `night_resolution` label so this issue is not picked up again. Create the
label first if it does not yet exist in the repository.

```bash
gh label create night_resolution \
  --description "Resolved by the automated simple-issue agent" \
  --color 0e8a16 2>/dev/null || true
gh issue add-label <number> --label night_resolution
```

> Note: adding `night_resolution` is the queue marker, not a close signal. Do not
> close the issue unless the issue itself asks for it or the user tells you to —
> leave that decision to a human review.

## Step 5 — Report

Summarise what you did: the issue number and title, the fix and files touched, how
it was verified, the commit hash, the comment you posted, and the label you added.
If you could not resolve the issue, say so plainly, do **not** add the
`night_resolution` label, and explain what is blocking.

## Rules

- Resolve exactly one issue per run — the single oldest match.
- Act autonomously; do not ask the user questions mid-run. Make the call yourself.
- Never add `night_resolution` to an issue you did not actually resolve.
- Follow the repository's `CLAUDE.md` conventions for any code you write.
