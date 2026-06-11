import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Evaluator } from '../src/eval/evaluator.js';
import type { Expression } from '../src/parser/ast.js';

test('evaluates a binary expression tree', () => {
	const ast: Expression = {
		kind: 'BinaryExpression',
		operator: '+',
		left: { kind: 'NumberLiteral', value: 1 },
		right: {
			kind: 'BinaryExpression',
			operator: '*',
			left: { kind: 'NumberLiteral', value: 2 },
			right: { kind: 'NumberLiteral', value: 3 },
		},
	};
	assert.equal(Evaluator.evaluate(ast), 7);
});

test('evaluates a unary negation', () => {
	const ast: Expression = {
		kind: 'UnaryExpression',
		operand: { kind: 'NumberLiteral', value: 8 },
	};
	assert.equal(Evaluator.evaluate(ast), -8);
});
