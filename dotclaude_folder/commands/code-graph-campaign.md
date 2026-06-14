---
description: Work a de-risked optimization worklist from the graph — apply the safe wins one at a time, each independently verified, skip on failure, and report.
argument-hint: [max-items]
allowed-tools: Bash, Read, Edit, Skill
---

# code-graph-campaign

You are an autonomous TypeScript optimization agent running a **campaign**: instead of
a single edit, you work through a ranked, de-risked worklist the graph produces, apply
the safe wins one at a time, verify each in isolation, and never halt on a single
failure. You finish with a one-line-per-item report.

Use the code knowledge graph as your eyes, exactly as `/code-graph-optimize` does; this
command adds the *loop* and the *ledger* around that same discipline. The
`code-graph-query` skill documents the CLI.

## Budget

 $ARGUMENTS

Treat the argument as the maximum number of items to **apply** this run (default
**5**). Stop when you have applied that many, when the `auto-applicable` worklist is
exhausted, or when a full pass leaves nothing safe to apply.

## Step 1 — Build the worklist

In the project you are optimizing, run the CLI with `npx ts-knowledge-graph` (when
running inside the ts-knowledge-graph repository itself, substitute `npm run dev --`).
If `./.ts_knowledge_graph/graph.kuzu` does not exist, build it first with
`extract . --semantic` then `load`. For a runtime-ranked worklist, `enrich` it from a
CPU profile first (see the `code-graph-query` skill); without one, hotspots fall back
to static fan-in and the plan flags it.

Get the plan as JSON:

- `npx ts-knowledge-graph campaign --json [--limit <n>] [--max-blast <n>]` — a ranked
  worklist of items, each carrying `candidate` (`dead-export` | `hotspot`), `readiness`
  (`auto-applicable` | `needs-workload` | `manual`), `score`, `metric`, and
  `blastRadius`.

## Step 2 — Confirm the working tree is clean

`git status --short` must be empty before you start, so each item commits and reverts
cleanly. If it is not, stop and say so — do not mix the campaign with unrelated work.

## Step 3 — Work the list, one item at a time

Walk the worklist top-down. Decide by `readiness`:

- **`auto-applicable`** — apply it. These are behavior-preserving (dead-code removals,
  bounded coordinated changes). Run the `/code-graph-optimize` discipline: confirm the
  blast radius with `references` / `who-calls`, make the one coordinated change, then
  `npx ts-knowledge-graph verify --json`.
- **`needs-workload`** — apply only if a benchmark workload is available. Capture a
  `--save-baseline`, make the change, `verify`, then re-benchmark with `--baseline` and
  keep it only on a measured `improved` delta. If no workload exists, **defer** the
  item (record it; never guess an improvement).
- **`manual`** — never apply. Record it for the report and move on.

After each applied item:

- **verify `ok: true`** → the change is safe. Commit just that item on the current
  branch with a one-line message (e.g. `perf(string_utils): remove dead export CaseStyle`).
  Do **not** push and do **not** open a PR.
- **verify `ok: false`** → `git restore` every file you touched, record the item as
  **skipped (failed verify)**, and continue. Never halt the campaign on one failure.

Removing a symbol can make others dead; regenerating the plan with `campaign --json` is
cheap, so re-run it if you cleared several removals.

## Step 4 — Report

End with a compact ledger, one line per item — `applied` (with how it was verified:
tested vs type-check-only; for a runtime item, the measured delta), `skipped` (why), or
`deferred` (needs a workload, or manual). Give the count applied and the commits made.
Never claim a speed-up you did not measure.

## Rules

- This is a loop around `/code-graph-optimize`'s discipline — every per-item safety rule
  there still holds: preserve observable behavior, stay inside the enumerated blast
  radius, claim only what a gate proved.
- Skip, never halt: one failed or deferred item must not stop the run.
- One commit per verified item, on the current branch. No branch, no push, no PR.
- Never apply `manual` items, and never apply `needs-workload` items without a workload
  to benchmark against.
- Stop at the budget and report; do not run indefinitely.
