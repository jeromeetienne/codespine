import { Calc } from './calc.js';

/**
 * A tiny end-to-end example, runnable with `npm run dev` (or `npx tsx
 * src/main.ts`).
 *
 * It also roots the call graph: `main` is *not* exported, so its calls give
 * {@link Calc} — and, transitively, the tokenizer, parser, and evaluator —
 * genuine inbound `CALLS` / `INSTANTIATES` edges.
 */
function main(): void {
	const expressions = ['1 + 2 * 3', '(1 + 2) * 3', '-4 + 10 / 2', '2 * (3 + 4) - 1'];
	for (const expression of expressions) {
		console.log(`${expression} = ${Calc.evaluate(expression)}`);
	}
}

main();
