import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tokenizer } from '../src/lexer/tokenizer.js';
import { Parser } from '../src/parser/parser.js';

test('builds a precedence-correct AST', () => {
	const tokens = new Tokenizer('1 + 2 * 3').tokenize();
	const ast = new Parser(tokens).parse();
	assert.deepEqual(ast, {
		kind: 'BinaryExpression',
		operator: '+',
		left: { kind: 'NumberLiteral', value: 1 },
		right: {
			kind: 'BinaryExpression',
			operator: '*',
			left: { kind: 'NumberLiteral', value: 2 },
			right: { kind: 'NumberLiteral', value: 3 },
		},
	});
});

test('parses a unary minus', () => {
	const tokens = new Tokenizer('-5').tokenize();
	const ast = new Parser(tokens).parse();
	assert.deepEqual(ast, {
		kind: 'UnaryExpression',
		operand: { kind: 'NumberLiteral', value: 5 },
	});
});

test('rejects a malformed expression', () => {
	const tokens = new Tokenizer('1 +').tokenize();
	assert.throws(() => new Parser(tokens).parse(), /expected/);
});
