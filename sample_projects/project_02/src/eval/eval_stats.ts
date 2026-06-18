let nodesEvaluated = 0;

/**
 * Mutable module-level instrumentation for the {@link Evaluator}: a running count
 * of how many AST nodes the evaluator has visited.
 *
 * Incidental optimisation target (behavioral layer): shared mutable module state.
 * The counter is a module-level `let` that {@link EvalStats.record} and
 * {@link EvalStats.reset} assign to, so the graph carries `WRITES` edges from those
 * methods to the `nodesEvaluated` variable (and `READS` edges from the ones that
 * read it). It is the project's `WRITES` fixture; a real optimisation would thread
 * the count through the call instead of keeping it in module scope.
 */
export class EvalStats {
	/** Record that one AST node was evaluated. */
	static record(): void {
		nodesEvaluated += 1;
	}

	/** How many nodes have been evaluated since the last {@link EvalStats.reset}. */
	static count(): number {
		return nodesEvaluated;
	}

	/** Reset the counter to zero. */
	static reset(): void {
		nodesEvaluated = 0;
	}
}
