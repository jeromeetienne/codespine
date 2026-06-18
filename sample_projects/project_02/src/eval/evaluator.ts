import type { BinaryExpression, Expression, UnaryExpression } from '../parser/ast.js';
import { EvalStats } from './eval_stats.js';

/** Evaluates an {@link Expression} AST to a number. */
export class Evaluator {
	/** Recursively evaluate any expression node. */
	static evaluate(node: Expression): number {
		EvalStats.record();
		if (node.kind === 'NumberLiteral') {
			return node.value;
		}
		if (node.kind === 'UnaryExpression') {
			return Evaluator.applyUnary(node);
		}
		return Evaluator.applyBinary(node);
	}

	/** Negate the evaluated operand. Single-use helper of {@link Evaluator.evaluate}. */
	private static applyUnary(node: UnaryExpression): number {
		return -Evaluator.evaluate(node.operand);
	}

	/** Apply a binary operator to its evaluated operands. Single-use helper. */
	private static applyBinary(node: BinaryExpression): number {
		const left = Evaluator.evaluate(node.left);
		const right = Evaluator.evaluate(node.right);
		switch (node.operator) {
			case '+':
				return left + right;
			case '-':
				return left - right;
			case '*':
				return left * right;
			case '/':
				return left / right;
		}
	}

	/**
	 * Evaluate a flat list of numbers and operators in postfix (RPN) order.
	 *
	 * Incidental optimisation target: a dead intermediate. This is a superseded
	 * evaluation path from before the AST {@link Evaluator.evaluate} above
	 * existed. Nothing calls it — `who-calls` returns no results and
	 * `references` is empty — so it is safe dead code to remove. It survives
	 * `dead-exports` only because that query is member-aware and the enclosing
	 * `Evaluator` class is live; an uncalled *method* is found with `who-calls`.
	 */
	static evaluatePostfix(tokens: readonly string[]): number {
		const stack: number[] = [];
		for (const token of tokens) {
			if (
				token === '+' ||
				token === '-' ||
				token === '*' ||
				token === '/'
			) {
				const right = stack.pop() ?? 0;
				const left = stack.pop() ?? 0;
				stack.push(Evaluator.applyOperator(token, left, right));
				continue;
			}
			stack.push(Number(token));
		}
		return stack.pop() ?? 0;
	}

	/** Apply an operator by its symbol. Only reachable from the dead postfix path. */
	private static applyOperator(operator: string, left: number, right: number): number {
		switch (operator) {
			case '+':
				return left + right;
			case '-':
				return left - right;
			case '*':
				return left * right;
			default:
				return left / right;
		}
	}
}
