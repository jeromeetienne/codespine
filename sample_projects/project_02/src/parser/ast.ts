/**
 * The expression AST, modelled as a small class hierarchy: an {@link AstNode}
 * interface, an abstract {@link Expression} base, and one concrete node class per
 * shape. This is what makes `calc` the project's heritage fixture as well as its
 * call-graph fixture — the graph carries `Interface` (`AstNode`), `IMPLEMENTS`
 * (`Expression implements AstNode`), `EXTENDS` (each node extends `Expression`),
 * and `OVERRIDES` (each `describe` overrides the abstract one) edges.
 */

/** Any node that can render itself to a short, parenthesised string. */
export interface AstNode {
	/** A canonical, fully parenthesised rendering of this subtree. */
	describe(): string;
}

/** Abstract base for every node in the expression AST. */
export abstract class Expression implements AstNode {
	/** A canonical, fully parenthesised rendering of this subtree. */
	abstract describe(): string;
}

/** A literal numeric value. */
export class NumberLiteral extends Expression {
	constructor(readonly value: number) {
		super();
	}

	override describe(): string {
		return String(this.value);
	}
}

/** A binary operation over two sub-expressions. */
export class BinaryExpression extends Expression {
	constructor(
		readonly operator: '+' | '-' | '*' | '/',
		readonly left: Expression,
		readonly right: Expression,
	) {
		super();
	}

	override describe(): string {
		return `(${this.left.describe()} ${this.operator} ${this.right.describe()})`;
	}
}

/** A unary negation of a sub-expression. */
export class UnaryExpression extends Expression {
	constructor(readonly operand: Expression) {
		super();
	}

	override describe(): string {
		return `-${this.operand.describe()}`;
	}
}
