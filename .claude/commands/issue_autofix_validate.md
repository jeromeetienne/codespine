---
description: Validate the autofix queue before a run — check each queued GitHub issue is defined well enough to fix automatically, interview you to fill any gaps, rewrite the issue, and label it 'autofix-ready' or park it 'autofix-needs-info'. Interactive and optional; a run works with or without it. Never fixes code, never merges.
allowed-tools: Bash, Read, Write, Grep, Glob, AskUserQuestion, Skill
---

# issue_autofix_validate

You make sure queued autofix issues are defined well enough to fix automatically
*before* the resolver runs. You read the autofix queue, judge each issue against a
readiness rubric, and — for any that are underspecified — interview the user, rewrite
the issue with their answers, and label it. Running this is **optional**: it makes a
run go more smoothly, but `/issue_autofix` and `/issue_autofix_session` work with or
without it.

This is the **one interactive command** in the set, and the only human-in-the-loop
step. Run it **with the user present**: unlike `/issue_autofix` and
`/issue_autofix_session`, it asks questions. It **never fixes code, opens a PR,
merges, or closes an issue** — its only effects are editing an issue's description and
adding one of two labels.

Use the `gh` CLI for every GitHub interaction.

## The readiness rubric

An issue is **autofix-ready** only if all four hold. These are the questions the
interview exists to answer:

1. **Clear outcome** — it says what is wrong and what "fixed" looks like: for a bug,
   the expected behaviour versus the actual; for a small change, the concrete desired
   end state.
2. **Locatable in the code** — it points at where the change goes: a file, function,
   type, command, route, error message, or UI label — specific enough that the
   resolver can find the spot without guessing.
3. **Bounded scope** — it is one small, self-contained change suitable for "the
   smallest correct fix", not an open-ended or multi-part request.
4. **Checkable acceptance** — there is a way to confirm the fix (a repro, an expected
   output, or a clear test target), so the resolver's check-gate is meaningful.

## Step 1 — Gather the queue to validate

If `$ARGUMENTS` names one or more issue numbers, validate exactly those (you may
re-validate an issue even if it is already labelled). Otherwise take every open issue
that is queued but not yet validated, parked, or handled — labelled `autofix`, without
`autofix-ready`, `autofix-needs-info`, `autofixed`, or `autofix-failed`:

```bash
gh issue list --state open --label autofix \
  --search '-label:autofix-ready -label:autofix-needs-info -label:autofixed -label:autofix-failed sort:created-asc' \
  --json number,title,body,labels --limit 100
```

If nothing matches, report that the queue is fully validated and stop — do not invent
work.

## Step 2 — Judge each issue against the rubric

Read each candidate in full and decide whether it already satisfies all four criteria:

```bash
gh issue view <number> --json title,body,comments
```

Ground criterion 2 in the actual code rather than trusting the prose. When an issue
names a file, symbol, or identifier, confirm it exists: use `git grep` (or whatever
code-search tooling the project provides) to check that the referenced files,
functions, and types are real and to see what a change would touch.
An issue that points at code that does not exist is **not** ready, however confident
it reads.

Classify each issue as **ready** or **underspecified**. For each underspecified one,
note exactly which criteria fail and what is missing — that list is the agenda for its
interview.

## Step 3 — Warn: show the verdict before changing anything

Print a short summary so the user sees the whole queue up front, for example:

```
Autofix queue validation — 4 issues
ready:          #12  right-align numeric columns
ready:          #15  link footer to repo
underspecified: #14  "fix the export"      (no target file; no expected behaviour; unbounded)
underspecified: #18  "support languages"   (scope too large; no acceptance criterion)
```

Issues that are already ready need no interview — they are labelled in Step 6. Then
work through the underspecified issues one at a time.

## Step 4 — Interview, one issue at a time

For each underspecified issue, ask the user focused questions that target exactly the
gaps you found — not a generic form. Use the `AskUserQuestion` tool, and draw the
options from the code where you can (the candidate files, the plausible behaviours), so
answering is a quick choice rather than an essay.

Aim each round at the failing criteria:
- **Outcome** — "What should happen instead of what happens now?"
- **Location** — "Which file or function should change?" (offer the candidates you found)
- **Scope** — "What is the smallest acceptable change — just X, or also Y?"
- **Acceptance** — "How will we know it is fixed?"

Ask follow-ups until the four criteria are satisfied, or until it is clear the issue
cannot be pinned down right now. If the user does not know, or skips the issue, do not
force it — it becomes `autofix-needs-info` in Step 6. Never invent scope the reporter
did not ask for.

## Step 5 — Rewrite the issues you clarified

For each issue the interview brought to ready, write the clarified definition back onto
the issue **body** so the resolver reads it directly — and **preserve the reporter's
original text**: move it, verbatim, under a `## Reported` heading and put the clarified
definition above it.

Read the current body, compose the new one (a temp file keeps the formatting clean),
then edit:

```bash
# Write the new body to a temp file — clarified definition first, original under
# "## Reported" — then apply it:
gh issue edit <number> --body-file /tmp/issue_autofix_validate_body.md
```

A good rewritten body looks like:

```markdown
**Summary:** <one line — the concrete change>

**Expected vs actual:** <what should happen; what happens now>
**Where:** <file(s) / symbol(s) the fix touches, confirmed against the code>
**Acceptance:** <how to tell it is fixed — repro, expected output, or test target>

## Reported

<the reporter's original body, verbatim>
```

Issues that were **already ready** keep their good description untouched — do not
rewrite them; they only need the label in Step 6. Never rewrite the body of an issue
you are about to mark `autofix-needs-info`.

## Step 6 — Label the outcomes

Create the labels if they do not exist, then apply exactly one to each issue:

```bash
gh label create autofix-ready --description "Validated: defined well enough to autofix" --color 1d76db 2>/dev/null || true
gh label create autofix-needs-info --description "Too underspecified to autofix; needs the reporter to clarify" --color fbca04 2>/dev/null || true
```

- **Ready** (already ready, or clarified to ready) → `gh issue edit <number> --add-label autofix-ready`.
  This records that the issue has been vetted, so a later validation pass skips it. It
  is advisory — `/issue_autofix` and `/issue_autofix_session` pick the issue up the
  same as any queued issue, validated or not.
- **Still underspecified, or skipped** → `gh issue edit <number> --add-label autofix-needs-info`.
  The issue keeps its `autofix` label so you can still find it, but the resolver skips
  it until a later validation clears it. Leave a short comment naming what is missing,
  so the reporter knows what to add:

  ```bash
  gh issue comment <number> --body "Not yet autofix-ready — missing: <the criteria that fail>.

  Add the detail above and re-run \`/issue_autofix_validate <number>\` to queue it."
  ```

## Step 7 — Report

Print one line per issue, grouped by outcome:

```
Autofix queue validation — 2026-06-16
ready:      #12  right-align numeric columns      (already well-defined)
ready:      #14  fix CSV export header row        (clarified: target src/export.ts, expected vs actual, repro)
needs-info: #18  support multiple languages       (scope too large; parked for the reporter)
```

End with totals and the reminder that `autofix-needs-info` issues are parked — the
resolver skips them until they are clarified and re-validated — while every other
queued issue (vetted `autofix-ready` or not yet validated) is fair game for
`/issue_autofix` and `/issue_autofix_session`.

## Rules

- This is the only interactive command in the set: run it with the user present. The
  resolver and the session stay fully autonomous; they never ask questions.
- Validation is optional: it never blocks a run. A queued issue you never validate is
  still picked up; only an issue you explicitly park as `autofix-needs-info` is skipped.
- Never fix code, open a PR, merge, or close an issue. The only mutations are editing
  an issue body (for ready issues) and adding `autofix-ready` / `autofix-needs-info`.
- Preserve the reporter's original text whenever you rewrite a body — move it under
  `## Reported`, never delete it. Do not rewrite an already-ready issue's body, and
  never rewrite a body you are about to mark `autofix-needs-info`.
- An issue is ready only if it passes all four rubric criteria; ground "locatable in
  the code" against the actual repository (`git grep` or the project's code-search
  tooling), never prose alone.
- When an issue cannot be pinned down, leave it `autofix-needs-info` rather than guess
  — never invent scope the reporter did not ask for.
- Follow the repository's `CLAUDE.md` conventions for any text you write into issues.
