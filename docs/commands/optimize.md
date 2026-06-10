# `optimize`

Run the autonomous optimization agent against the loaded graph. The agent uses
the read-only query tools to find a safe improvement, proposes a single edit,
and the harness keeps that edit only if `tsc --noEmit` still passes.

Source: [`src/commands/optimize_command.ts`](../../src/commands/optimize_command.ts) ·
agent: [`src/agent/optimizer_agent.ts`](../../src/agent/optimizer_agent.ts),
tools: [`src/agent/agent_tools.ts`](../../src/agent/agent_tools.ts)

## Synopsis

```bash
ts-knowledge-graph optimize [task] [options]

# development
npm run dev -- optimize [task] [options]
```

## Arguments

| Argument | Required | Default | Description |
| --- | --- | --- | --- |
| `[task]` | no | (the default mission, below) | A natural-language description of what the agent should try to optimize. |

The default task is:

> Find one genuinely dead exported symbol using `dead_exports`, confirm with
> `references` that it has zero inbound references, then remove it safely.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `-d, --db <path>` | `./outputs/graph.kuzu` | Kùzu database path. |
| `-m, --model <name>` | `$OPENAI_MODEL` | Model name. Falls back to the `OPENAI_MODEL` environment variable. |
| `--max-steps <n>` | `12` | Maximum number of agent steps (tool-calling rounds). |

## Prerequisites

The agent talks to any **OpenAI-compatible** chat-completions endpoint,
configured through environment variables. The command loads a `.env` file from
the current directory if one exists (via `process.loadEnvFile`), then requires:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | API key for the provider. |
| `OPENAI_MODEL` | yes (unless `--model`) | Default model name. |
| `OPENAI_BASE_URL` | no | Override the endpoint for non-OpenAI providers (OpenRouter, Ollama, LM Studio, vLLM). |

If `OPENAI_API_KEY` is unset, the command prints a red error and exits without
calling the model. If neither `--model` nor `OPENAI_MODEL` is set, it prints a
different error and exits. Copy [`.env-sample`](../../.env-sample) to `.env` and
fill in one provider block.

## What it does

1. Loads `.env`, validates the key and model, and opens the graph database.
2. Constructs an `OptimizerAgent` wired to:
   - `AgentTools` — the read-only graph queries plus `read_file`, exposed as LLM
     tools.
   - `CodeEditor` — unique-match find/replace with an in-memory backup so an
     edit can be reverted.
   - the chosen `model` and `maxSteps`.
3. Runs a tool-calling loop for up to `maxSteps` rounds.
4. Prints the transcript, then a summary of every verified edit that was kept.

### The agent's tools

All query tools are read-only and map one-to-one onto the CLI query commands:

| Tool | Equivalent command |
| --- | --- |
| `find_symbol` | [`find`](find.md) |
| `who_calls` | [`who-calls`](who-calls.md) |
| `references` | [`references`](references.md) |
| `blast_radius` | [`blast-radius`](blast-radius.md) |
| `neighbors` | [`neighbors`](neighbors.md) |
| `dead_exports` | [`dead-exports`](dead-exports.md) |
| `read_file` | — (reads project source, optionally a line range) |
| `propose_optimization` | — (the only tool that mutates files) |

### The propose → verify → keep/revert loop

The agent is instructed to find a candidate (dead code first), confirm its blast
radius is empty, read the exact file text, then call `propose_optimization` with
a unique find/replace edit and a rationale. For each proposal the harness:

1. **Applies** the edit through `CodeEditor` (the `find` text must match the file
   exactly and uniquely; otherwise the edit is rejected and the agent is told).
2. **Verifies** by running `tsc --noEmit` over the project.
3. **Keeps or reverts:**
   - **Pass** → the edit stays and is added to the applied list.
   - **Fail** → the edit is reverted from the in-memory backup and the compiler
     errors are handed back to the agent for another attempt.

The agent stops when it has applied a verified improvement (or concluded there
is no safe one), or when it hits `maxSteps`.

## Output

The model's reasoning is streamed as gray transcript lines, followed by a
summary:

```
Model: gpt-5.1
Task: Find one genuinely dead exported symbol ...

...transcript...

Applied 1 verified edit(s):
  ✓ src/schema/node.ts — removed unused exported type alias `Range` (zero inbound references)
```

If nothing was kept, the summary reads `(none — the agent found no safe change,
or reverted what it tried)`.

## Examples

```bash
# default mission: find and remove one dead export
ts-knowledge-graph optimize

# a directed task
ts-knowledge-graph optimize "Inline the single-use helper formatRow in src/report.ts"

# pick a model and allow more steps
ts-knowledge-graph optimize --model gpt-5.1 --max-steps 20

# query a database in a non-default location
ts-knowledge-graph optimize --db ./outputs/self.kuzu
```

## Notes and caveats

- **Run on a clean git tree.** The agent edits files in place; `git diff` is how
  you review what it kept, and `git checkout -- <file>` is how you discard it.
- **Verification is type-checking only.** A change that type-checks can still
  alter behavior. The agent is instructed to prefer dead-code removal and
  behavior-preserving simplifications, but the harness does not yet run the test
  suite — review every kept edit.
- **Model choice matters.** The agent must chain tool calls reliably
  (`dead_exports` → `references` → `read_file` → `propose_optimization`). Strong
  tool-calling models do this well; small local models tend to skip the
  verification steps and get their edits rejected.
- The database must already be built — run [`extract`](extract.md) `--semantic`
  and [`load`](load.md) first.

## See also

- [`dead-exports`](dead-exports.md) — the agent's usual starting query.
- [Getting Started](../GETTING_STARTED.md) — provider setup and a full agent run.
