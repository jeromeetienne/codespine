import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tokenizer } from '../src/lexer/tokenizer.js';
import { Parser } from '../src/parser/parser.js';
import { BinaryExpression, NumberLiteral, UnaryExpression } from '../src/parser/ast.js';

test('builds a precedence-correct AST', () => {
	const tokens = new Tokenizer('1 + 2 * 3').tokenize();
	const ast = new Parser(tokens).parse();
	assert.deepEqual(
		ast,
		new BinaryExpression(
			'+',
			new NumberLiteral(1),
			new BinaryExpression('*', new NumberLiteral(2), new NumberLiteral(3)),
		),
	);
});

test('parses a unary minus', () => {
	const tokens = new Tokenizer('-5').tokenize();
	const ast = new Parser(tokens).parse();
	assert.deepEqual(ast, new UnaryExpression(new NumberLiteral(5)));
});

test('renders a canonical, fully parenthesised form', () => {
	const tokens = new Tokenizer('1 + 2 * 3').tokenize();
	const ast = new Parser(tokens).parse();
	assert.equal(ast.describe(), '(1 + (2 * 3))');
});

test('rejects a malformed expression', () => {
	const tokens = new Tokenizer('1 +').tokenize();
	assert.throws(() => new Parser(tokens).parse(), /expected/);
});
