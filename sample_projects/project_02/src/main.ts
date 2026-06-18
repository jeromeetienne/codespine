import { Calc } from './calc.js';
import { EvalStats } from './eval/eval_stats.js';

/**
 * A tiny end-to-end example, runnable with `npm run dev` (or `npx tsx
 * src/main.ts`).
 *
 * It also roots the call graph: `main` is *not* exported, so its calls give
 * {@link Calc} — and, transitively, the tokenizer, parser, and evaluator —
 * genuine inbound `CALLS` / `INSTANTIATES` edges. Resetting and reading
 * {@link EvalStats} around each evaluation also keeps the mutable-counter path
 * live, so its `READS` / `WRITES` edges have an in-graph caller.
 */
function main(): void {
	const expressions = ['1 + 2 * 3', '(1 + 2) * 3', '-4 + 10 / 2', '2 * (3 + 4) - 1'];
	for (const expression of expressions) {
		EvalStats.reset();
		const result = Calc.evaluate(expression);
		const canonical = Calc.parse(expression).describe();
		console.log(`${expression} = ${result}  →  ${canonical}  (${EvalStats.count()} nodes evaluated)`);
	}
}

main();
