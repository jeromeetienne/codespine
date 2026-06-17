# `install`

Copy the bundled [Claude Code](https://claude.com/claude-code) assets — every
slash command and skill under
[`dotclaude_folder/`](../../dotclaude_folder) — into a target project's
`.claude/` directory, so an agent in that project can drive the knowledge graph
through this CLI. This is the one-time setup step for the
`/code-graph-optimize` and `/code-graph-interview` commands and the
`code-graph-query` skill.

Source: [`src/commands/install_command.ts`](../../src/commands/install_command.ts)

## Synopsis

```bash
npx ts-knowledge-graph install [destFolder] [options]
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

Mirrors the whole `dotclaude_folder/` tree into `<destFolder>/`, preserving the
relative layout so each file lands where Claude Code reads it (`destFolder` is
itself a `.claude` directory):

```
dotclaude_folder/commands/*.md              ->  <destFolder>/commands/*.md
dotclaude_folder/skills/<name>/SKILL.md     ->  <destFolder>/skills/<name>/SKILL.md
```

The copy is recursive and content-agnostic, so any command or skill added to the
package in a future release is installed automatically — there is no hardcoded
file list.

Notable behavior:

- **Non-destructive by default.** A file that already exists at the destination
  is skipped, never overwritten, unless you pass `--force`.
- **Creates the destination directory and its subdirectories** as needed.
- **Per-file report.** Each installed file is printed with a `✓`, each skipped
  file with a `✗ skip (exists)`, followed by a one-line summary.

## Output

```text
✓ commands/code-graph-interview.md
✓ commands/code-graph-optimize.md
✓ skills/code-graph-query/SKILL.md

installed 3 file(s) into /path/to/project/.claude
```

Re-running without `--force` skips what is already there:

```text
✗ skip (exists): commands/code-graph-optimize.md

installed 2 file(s) into /path/to/project/.claude, skipped 1 (pass --force to overwrite)
```

## Examples

```bash
# run from inside the target .claude directory
npx ts-knowledge-graph install

# install into a specific project's .claude directory
npx ts-knowledge-graph install ~/code/my-app/.claude

# install at the user level
npx ts-knowledge-graph install ~/.claude

# refresh the installed assets after upgrading the package
npx ts-knowledge-graph install --force
```

## Notes and caveats

- The installed commands and skill query the graph through this CLI, so the
  target project still needs a built database (`extract` then `load`) before the
  agent can answer impact, caller, and dead-code questions.
- `--force` overwrites any local edits to the installed files. If you have
  customised them, back them up first.

## See also

- The `/code-graph-optimize` and `/code-graph-interview` commands and the
  `code-graph-query` skill under
  [`dotclaude_folder/`](../../dotclaude_folder) — what this command installs.
- [`extract`](extract.md), [`load`](load.md) — build the database the installed
  assets query.
