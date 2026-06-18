# `install`

Copy the bundled [Claude Code](https://claude.com/claude-code) assets — every
slash command and skill under
[`dotclaude_folder/`](../../dotclaude_folder) — into a target project's
`.claude/` directory, so an agent in that project can drive the knowledge graph
through this CLI. This is the one-time setup step for the
`/codespine-optimize` and `/codespine-interview` commands and the
`codespine-query` skill.

Source: [`src/commands/install_command.ts`](../../src/commands/install_command.ts)

## Synopsis

```bash
npx codespine install [destFolder] [options]
```

## Arguments

| Argument | Required | Description |
| --- | --- | --- |
| `[destFolder]` | no | The `.claude` directory to install into. Assets are written straight into it — nothing is appended. Defaults to the current directory (`.`), so you can run it from inside the target `.claude` directory. |

## Options

| Option | Default | Description |
| --- | --- | --- |
| `--force` | `false` | Overwrite files that already exist. Without it, existing files are left untouched and reported as skipped. |

## What it does

Mirrors the `dotclaude_folder/` tree into `<destFolder>/` — every command and
skill, but not the folder's own `README.md` (that file documents
`dotclaude_folder/` and is not a Claude Code asset) — preserving the relative
layout so each file lands where Claude Code reads it (`destFolder` is itself a
`.claude` directory):

```
dotclaude_folder/commands/*.md              ->  <destFolder>/commands/*.md
dotclaude_folder/skills/<name>/SKILL.md     ->  <destFolder>/skills/<name>/SKILL.md
```

The copy is recursive, so any command or skill added to the package in a future
release is installed automatically; the only file held back is the folder's own
`README.md`.

Notable behavior:

- **Non-destructive by default.** A file that already exists at the destination
  is skipped, never overwritten, unless you pass `--force`.
- **Skips the folder's `README.md`.** It documents `dotclaude_folder/` itself, so
  it is never copied into the destination.
- **Creates the destination directory and its subdirectories** as needed.
- **Per-file report.** Each installed file is printed with a `✓`, each skipped
  file with a `✗ skip (exists)`, followed by a one-line summary.

## Output

```text
✓ commands/codespine-interview.md
✓ commands/codespine-optimize.md
✓ skills/codespine-query/SKILL.md

installed 3 file(s) into /path/to/project/.claude
```

Re-running without `--force` skips what is already there:

```text
✗ skip (exists): commands/codespine-optimize.md

installed 2 file(s) into /path/to/project/.claude, skipped 1 (pass --force to overwrite)
```

## Examples

```bash
# run from inside the target .claude directory
npx codespine install

# install into a specific project's .claude directory
npx codespine install ~/code/my-app/.claude

# install at the user level
npx codespine install ~/.claude

# refresh the installed assets after upgrading the package
npx codespine install --force
```

## Notes and caveats

- The installed commands and skill query the graph through this CLI, so the
  target project still needs a built database (`extract` then `load`) before the
  agent can answer impact, caller, and dead-code questions.
- `--force` overwrites any local edits to the installed files. If you have
  customised them, back them up first.

## See also

- The `/codespine-optimize` and `/codespine-interview` commands and the
  `codespine-query` skill under
  [`dotclaude_folder/`](../../dotclaude_folder) — what this command installs.
- [`extract`](extract.md), [`load`](load.md) — build the database the installed
  assets query.
