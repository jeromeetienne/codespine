---
description: Create a dated branch and loop /fix_simple_issue over the queue until no matching issue remains.
allowed-tools: Bash, Skill
---

# start_simple_issue_fix

You drive a batch run of the simple-issue resolver. Create a working branch, then
repeatedly resolve queued issues one at a time until the queue is empty.

## Step 1 — Create the branch

Create and switch to a branch named `simple_issue_fix_YYYYMMDD_HHMM`, using the
current date and time:

```bash
git switch -c "simple_issue_fix_$(date +%Y%m%d_%H%M)"
```

Confirm the branch was created and that you are on it (`git branch --show-current`)
before going further.

## Step 2 — Check the queue before looping

Before starting the loop, check whether any issue is even eligible, so you do not
start a loop with nothing to do:

```bash
gh issue list \
  --state open \
  --label simple_issue \
  --search '-label:night_resolution sort:created-asc' \
  --json number \
  --limit 1
```

If the result is empty, report that there is nothing to fix and stop here — the
branch is created but no work was needed.

## Step 3 — Loop the resolver

If at least one issue is eligible, start a self-paced loop of the resolver:

- Invoke `/loop fix_simple_issue` (the loop skill, self-paced — no interval).
- Each iteration runs the `fix_simple_issue` command, which selects and resolves
  the single oldest eligible issue and marks it `night_resolution`.

## Step 4 — Stopping condition

**Stop the loop as soon as there are no more issues to fix.** Concretely, end the
run when an iteration reports that no open `simple_issue` without `night_resolution`
remains (the queue query in Step 2 returns empty). Do not keep looping on an empty
queue, and do not invent new work.

Also stop and surface the problem if an iteration fails to resolve its issue (for
example, verification fails) rather than spinning on the same stuck issue — that
issue will not have been marked `night_resolution`, so it would be picked again.

## Step 5 — Report

When the loop ends, summarise the batch: the branch name, how many issues were
resolved, their numbers and titles, and any issue that was skipped or left blocked.
Remind the user that the work is committed on the new branch and was not pushed.

## Rules

- Stay on the branch you created for the whole run.
- Do not push or open a PR unless the user explicitly asks.
- Act autonomously; do not ask the user questions mid-run.
