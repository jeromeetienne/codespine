import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Evaluator } from '../src/eval/evaluator.js';
import { BinaryExpression, NumberLiteral, UnaryExpression } from '../src/parser/ast.js';

test('evaluates a binary expression tree', () => {
	const ast = new BinaryExpression(
		'+',
		new NumberLiteral(1),
		new BinaryExpression('*', new NumberLiteral(2), new NumberLiteral(3)),
	);
	assert.equal(Evaluator.evaluate(ast), 7);
});

test('evaluates a unary negation', () => {
	const ast = new UnaryExpression(new NumberLiteral(8));
	assert.equal(Evaluator.evaluate(ast), -8);
});
