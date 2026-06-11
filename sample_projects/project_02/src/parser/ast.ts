/** A literal numeric value. */
export type NumberLiteral = {
	kind: 'NumberLiteral';
	value: number;
};

/** A binary operation over two sub-expressions. */
export type BinaryExpression = {
	kind: 'BinaryExpression';
	operator: '+' | '-' | '*' | '/';
	left: Expression;
	right: Expression;
};

/** A unary negation of a sub-expression. */
export type UnaryExpression = {
	kind: 'UnaryExpression';
	operand: Expression;
};

/** Any node in the expression AST. */
export type Expression = NumberLiteral | BinaryExpression | UnaryExpression;
