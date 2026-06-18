# codespine vs graphify

A short, high-level comparison of two tools that both turn code into a queryable
knowledge graph — and why they are built for opposite ends of the problem.

## The honest take

Both tools turn a codebase into a graph you can query, but they are not really
competitors. **graphify is a cartographer for unfamiliar, heterogeneous corpora;
codespine is a precision instrument for a TypeScript codebase you intend
to change or optimize.** Choosing between them is mostly choosing the question you
are asking.

graphify points at *anything* — code in any language, or prose — and reads it
with an LLM to infer a graph of concepts and relationships. That is its strength:
zero setup, works on a mixed corpus, and hands you a conceptual map of territory
you have never seen. It is also its limit. Its reports carry a token-cost line and
tag edges `INFERRED` versus `EXTRACTED`, because the edges are a model's best
guess, and there is no notion of execution. It tells you what the code *looks
like*.

codespine does less, precisely. It reads TypeScript through the compiler
(`ts-morph`), so a call site links to the exact declaration it resolves to —
across files and through import aliases — not to everything that merely shares a
name. The edges are facts, not guesses; extraction is deterministic, local, and
spends no tokens. And it has a dimension graphify does not: a **runtime layer**
(V8 CPU profiles become self-time and sample-weighted cost propagation), so it can
tell you what the code *does, what it costs, and what is risky to change* — not
just what it looks like.

## At a glance

| | graphify | codespine |
| --- | --- | --- |
| Scope | Any language, any corpus, even prose | TypeScript projects only |
| Extraction | LLM inference (probabilistic) | Compiler and AST resolution (exact) |
| What an edge means | A plausible conceptual link | A resolved reference (`CALLS`, `USES_TYPE`, `EXTENDS`, …) |
| Dimensions | Static structure | Static structure **plus runtime cost** |
| Cost to run | Tokens, every run | A one-time local parse, no tokens |
| Reproducibility | Can vary run to run | Identical every run |
| Built to answer | "What is in here? What connects to what?" | "What breaks if I change this? Where does the time go?" |
| Output today | A `GRAPH_REPORT.md` snapshot | One-shot query answers and an interactive `webview` |

## When to reach for which

**Use graphify** when you are exploring something unfamiliar or mixed — a
repository in a language you do not parse, a documentation set, any corpus you
want a quick conceptual map of, and approximate-but-broad is good enough.

**Use codespine** when the codebase is TypeScript and you intend to *act*
on it: refactor safely with blast radius and references, delete with confidence
using dead-export detection, or optimize where it actually matters with hotspots
and cost. Precise-but-narrow, and grounded in how the code really runs.

## The one-line version

graphify maps territory you do not know; codespine gives you a precise,
runtime-aware model of the TypeScript you are about to change.
