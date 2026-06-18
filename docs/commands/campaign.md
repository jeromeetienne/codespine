# `campaign`

Rank a **de-risked optimization worklist** — "what should I optimize first?" —
combining the safest edits and the highest-leverage hotspots into one ordered list,
each entry tagged with how `/codespine-optimize` may take it. Where
[`dead-exports`](dead-exports.md) and [`hotspots`](hotspots.md) each answer one
question, `campaign` composes them and bounds every candidate by its blast radius,
so the result is a plan an agent can work top-down. Takes no argument.

Source: [`src/commands/campaign_command.ts`](../../src/commands/campaign_command.ts) ·
planner: `CampaignPlanner.plan` in
[`src/query/campaign_planner.ts`](../../src/query/campaign_planner.ts)

## Synopsis

```bash
npx codespine campaign [options]
```

## Arguments

None. The command scans the whole graph.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-o, --output-folder <dir>` | `./.codespine` | Output folder; the Kùzu database is read from `<dir>/graph.kuzu`. |
| `--by <metric>` | `self-time` when enriched, else `callers` | Metric the hotspot half of the worklist is ranked by — see [`hotspots`](hotspots.md). |
| `--limit <n>` | `20` | Maximum number of worklist items. Clamped to `1`–`1000`. |
| `--max-blast <n>` | `25` | Blast-radius ceiling: a hotspot whose transitive inbound reach exceeds it is tagged `manual`. Clamped to `0`–`1000`. |
| `--json` | `false` | Emit the raw JSON report instead of the formatted table. |

## What it does

Composes two graph signals into a single ranked list:

- **Safe removals** — every [`dead-exports`](dead-exports.md) result. A dead export
  has zero inbound references, so its blast radius is `0` and it is always
  `auto-applicable`.
- **Hotspots** — the top [`hotspots`](hotspots.md) by the chosen metric. For each,
  the transitive inbound [`blast-radius`](blast-radius.md) is measured and used to
  decide readiness.

### Readiness

Each item is tagged with how the optimizer may take it, mirroring
`/codespine-optimize`'s task classes:

| `readiness` | Meaning |
| --- | --- |
| `auto-applicable` | Behavior-preserving and safe to apply and `verify` autonomously — the dead-code removals. |
| `needs-workload` | A runtime-improvement candidate (a hotspot within the blast-radius ceiling); applying it is safe, but *claiming* the speed-up needs a `benchmark` workload. |
| `manual` | A hotspot whose blast radius exceeds `--max-blast` — too coupled to change in one autonomous pass; a human drives it. |

### Order

`auto-applicable` first (the safest wins), then `needs-workload`, then `manual`;
within a tier, by descending score, then file path and line. The order is stable
across runs, and `--limit` truncates the combined list — so when removals fill the
limit, raise `--limit` to see the hotspots underneath.

## Output

Formatted (default) — a header naming the hotspot metric and the manual ceiling,
then one ranked line per item (`rank`, `readiness`, `kind`, `name`, detail,
location):

```
Optimization campaign (hotspots by self-time · manual above blast radius 25)
 1. auto-applicable  Variable  DEFAULT_LOCALE  safe removal  shared/constants.ts:11
 2. auto-applicable  Class     LegacyStringUtils  safe removal  utils/legacy_string_utils.ts:10
 3. needs-workload   Method    titleCase  4368.212 self-time · blast 2  utils/string_utils.ts:20

3 item(s) — 2 auto-applicable, 1 needs-workload
```

JSON (`--json`) — the full report. Each entry in `items` is a `SymbolRef` plus
`candidate`, `readiness`, `score`, `metric`, and `blastRadius`; the envelope records
how hotspots were ranked and the ceiling applied:

```json
{
  "enriched": true,
  "metric": "self-time",
  "fellBack": false,
  "maxBlastRadius": 25,
  "items": [
    {
      "id": "MethodDeclaration:utils/string_utils.ts#titleCase@20",
      "kind": "Method",
      "name": "titleCase",
      "filePath": "utils/string_utils.ts",
      "startLine": 20,
      "metadata": { "runtime": { "selfMs": 4368.212 } },
      "candidate": "hotspot",
      "readiness": "needs-workload",
      "score": 4368.212,
      "metric": "self-time",
      "blastRadius": 2
    }
  ]
}
```

## Examples

```bash
# the default worklist — safe removals first, then runtime hotspots
npx codespine campaign

# a tighter coupling bound: only near-leaf hotspots stay auto-workable
npx codespine campaign --max-blast 5

# rank the hotspot half by static fan-in instead of measured time
npx codespine campaign --by callers

# machine-readable — the shape the campaign agent consumes
npx codespine campaign --json --limit 30
```

## Notes and caveats

- **Runtime ranking needs [`enrich`](enrich.md).** Without a profile the hotspot
  half falls back to static fan-in (`callers`), sets `fellBack: true`, and prints a
  notice — the removals are unaffected.
- **A worklist is not a guarantee.** `needs-workload` items are *candidates*; only a
  measured [`benchmark`](benchmark.md) `improved` delta earns the word "optimized".
  The plan never asserts a speed-up.
- **Re-run after removals.** Deleting dead exports can make others dead; the plan is
  cheap to regenerate.
- **Static call edges only.** Like `hotspots`, dynamic dispatch is invisible — confirm
  a candidate with [`who-calls`](who-calls.md) / [`references`](references.md) before
  changing it.

## See also

- [`dead-exports`](dead-exports.md) and [`hotspots`](hotspots.md) — the two signals this command composes.
- [`/codespine-campaign`](../../dotclaude_folder/commands/codespine-campaign.md) — the agent loop that works this worklist top-down, applying and verifying each item.
- [`/codespine-optimize`](../../dotclaude_folder/commands/codespine-optimize.md) — applies a single item with the per-item discipline the campaign reuses.
