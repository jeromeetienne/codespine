---
description: Name the code's detected communities with concise, human-readable labels — you read each community's members and write the names back. No API key.
argument-hint: [output-folder]
allowed-tools: Bash, Read, Write, Skill
---

# codespine-name-communities

You name the code communities this project has already clustered. Detection is
done by the Leiden algorithm; this task is **only the naming**. There is no model
API call and no key — *you*, the agent reading this, are the namer. The CLI hands
you each community's members, you decide a good label, and the CLI writes it back.

The default labels are structural — a directory plus the most-coupled symbol, e.g.
`utils · normalizeWhitespace` or `legacy_string_utils`. They name the community's
*location*. Your job is to replace them with names that capture each community's
*responsibility* — the concept a developer would recognise — e.g. "Whitespace &
text normalization" or "Legacy string helpers".

## The output folder

The community data lives in a knowledge-graph database under an output folder
(default `./.codespine`). If `$ARGUMENTS` names a folder, pass it through
as `-o $ARGUMENTS` on every command below; otherwise omit `-o` and take the default.

## The CLI

Run the project's own CLI. In another project use `npx codespine`; **inside
this repository's own checkout, substitute `npm run dev --`** (e.g.
`npm run dev -- cluster communities --json`). Always pass `--json` and consume the
JSON. When you redirect `--json` to a file from inside this repo, the `npm run`
banner is written to stdout too — invoke `npx tsx src/cli.ts …` instead to get
clean JSON, or strip the leading banner lines before parsing.

## Method (follow it in order)

1. **Make sure communities exist.** Dump them:
   `npx codespine cluster communities --json`.
   - If it reports `communityCount: 0` (or warns "no communities found"), detect
     them first with `npx codespine cluster`, then dump again. If the dump
     warns the graph is empty, build it first:
     `npx codespine extract . --semantic` then `npx codespine load`,
     then `cluster`, then dump.
2. **Read the dump.** Each entry is `{ index, currentLabel, size, members: [{ name, kind, filePath }] }`,
   largest community first. Study the members of each community — their names,
   kinds (Class / Function / Interface / …), and the directories they share.
3. **Name each community.** For every community, decide a concise label (see the
   naming guidance below). Skip a community only when its structural `currentLabel`
   is already a genuinely good conceptual name.
4. **Write the labels file.** Create a JSON file mapping community index (as a
   string) to your label — include only the communities you are renaming:

   ```json
   {
     "0": "Whitespace & text normalization",
     "2": "Legacy string helpers"
   }
   ```

5. **Apply it.** `npx codespine cluster rename --labels <file> --json`. The
   command writes your labels onto `metadata.communityLabel` and the clustering
   manifest, and reports each `from → to` change. It ignores unknown indexes
   (reported under `unknownIndexes`) and silently skips labels equal to the current
   one, so a re-run is safe.
6. **Confirm and summarise.** Re-dump (`cluster communities`) or generate a report,
   and tell the user the old → new label for each community you renamed.

## Naming guidance

- **Name the responsibility, not the location.** "Graph persistence (Kùzu)" beats
  "store · KuzuStore". If the best name you can find is just the directory or the
  hub symbol, the structural label was already doing that — leave it.
- **Keep it short** — a 2–5 word noun phrase. It appears in the web view's legend
  and in reports.
- **Make every name distinct.** Two communities must not share a label; if they
  feel the same, find the distinction (e.g. "HTTP routing" vs "HTTP client").
- **Avoid empty words** — "utilities", "helpers", "misc", "core" — unless the
  members truly are a grab-bag with no shared theme.
- **Read the members, not just the count.** The kinds and file paths tell you
  whether a community is a data model, a pipeline stage, a CLI surface, etc.

## Rules

- Use the community indexes from the dump; never invent one. An index the dump did
  not list will be ignored by `rename`.
- This is a label-only change. It never edits source and never re-runs detection,
  so it is safe and fully reversible — re-running `cluster` restores the structural
  labels (and may renumber communities, so name *after* you detect).
- Act autonomously: read the dump, name every community worth naming, apply, and
  report. Do not ask the user to pick names — that is the job.
