# project_02 — `calc`

A small arithmetic expression evaluator: a string goes through a tokenizer, a
recursive-descent parser, and a tree-walking evaluator. It is one of four
sample projects used to exercise [`codespine`](../../README.md); each
sample stresses a different layer of the graph. **`calc` targets the behavioral
(call-graph) layer** — `CALLS` and `INSTANTIATES` edges, the `READS` / `WRITES`
value-access edges, and the `who-calls` / `calls` / `blast-radius` queries — **and
the type (heritage) layer**, because the AST is modelled as a class hierarchy.

The AST is the heritage fixture: an `AstNode` interface, an abstract `Expression`
base, and `NumberLiteral` / `BinaryExpression` / `UnaryExpression` subclasses that
`extends` it and `override` its `describe` method. That yields `Interface`
(`AstNode`), `IMPLEMENTS`, `EXTENDS` (3), and `OVERRIDES` edges — the type-layer
edges that `references` and `neighbors` traverse.

## What it contains

`main.ts` and `index.ts` sit at the `src/` root; the pipeline stages are grouped
into `lexer/`, `parser/`, and `eval/`.

| File | Exports | Role |
| --- | --- | --- |
| `src/main.ts` | — | runnable example; non-exported `main()` roots the call graph |
| `src/index.ts` | — | public barrel |
| `src/calc.ts` | `Calc` | orchestrates `tokenize → parse → evaluate` |
| `src/lexer/token.ts` | `TokenType`, `Token` | the token vocabulary |
| `src/lexer/tokenizer.ts` | `Tokenizer` | string → token list (stateful, instance methods) |
| `src/parser/ast.ts` | `AstNode`, `Expression`, `NumberLiteral`, `BinaryExpression`, `UnaryExpression` | the AST class hierarchy (the heritage fixture) |
| `src/parser/parser.ts` | `Parser` | token list → AST, by recursive descent |
| `src/eval/evaluator.ts` | `Evaluator` | AST → number |
| `src/eval/eval_stats.ts` | `EvalStats` | module-level evaluation counter (the `WRITES` fixture) |

The call graph is deep and linear: `main` → `Calc.evaluate` → `Calc.parse` →
`Parser.parse` → `parseExpression` → `parseTerm` → `parseFactor` → `parsePrimary`
→ `parseParenthesized` (which recurses back to `parseExpression`). That is what
makes it a good fixture for the call-graph queries.

## Planted optimisations

**Dominant — single-use helpers to inline (behavioral layer).** Several private
helpers have exactly one caller, so `who-calls` returns a single result for each
— natural inline candidates:

- `Parser.parseParenthesized` — only `Parser.parsePrimary` calls it.
- `Evaluator.applyUnary` and `Evaluator.applyBinary` — only `Evaluator.evaluate`
  dispatches to them.

**Incidental — a dead intermediate (found with `who-calls`, not `dead-exports`).**
`Evaluator.evaluatePostfix` is a superseded RPN evaluation path that nothing
calls. `who-calls` on it returns **no results** and `references` is empty, so it
is safe dead code to remove (its private helper `applyOperator` goes with it).

**Incidental — shared mutable module state (the `WRITES` fixture).**
`eval/eval_stats.ts` keeps a module-level `let nodesEvaluated` counter that
`Evaluator.evaluate` bumps through `EvalStats.record()`. Because the target is a
module-level variable (not a `this.` field, which the extractor does not treat as
a value write), the graph carries `WRITES` edges from `EvalStats.record` and
`EvalStats.reset` to that variable — the only `WRITES` edges across the four
samples — plus a `READS` edge from `EvalStats.count`. The optimisation is to thread
the count through the call chain instead of holding it in module scope.

> Note: `dead-exports` reports **nothing** for this project. `evaluatePostfix`
> lives on the `Evaluator` class, which is live (`Evaluator.evaluate` is called),
> and `dead-exports` is member-aware — so an unused *method* on a live class is
> invisible to it. The tool for finding dead methods is `who-calls` returning an
> empty set. That contrast is the point of this sample.

## Running it

```bash
# from this directory
npm test             # 12 tests
npm run dev          # the runnable example (src/main.ts)
```

## Exercising it with codespine

```bash
# from the codespine repo root
npm run extract -- sample_projects/project_02/src --semantic
npm run dev -- load

npm run dev -- find parseParenthesized
npm run dev -- who-calls <id>      # → exactly one caller: parsePrimary

npm run dev -- find evaluatePostfix
npm run dev -- who-calls <id>      # → no results: dead code

npm run dev -- find parsePrimary
npm run dev -- blast-radius <id> --depth 10   # → the whole chain up to main()
```

> `find` is a case-insensitive substring matcher and some names repeat (there are
> two `evaluate` methods — `Calc.evaluate` and `Evaluator.evaluate`). Pick the
> id whose file path matches the symbol you mean.
