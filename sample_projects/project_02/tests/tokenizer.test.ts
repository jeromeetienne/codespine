import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tokenizer } from '../src/lexer/tokenizer.js';
import { TokenType } from '../src/lexer/token.js';

test('tokenizes numbers and operators', () => {
	const tokens = new Tokenizer('1 + 22').tokenize();
	assert.deepEqual(
		tokens.map((token) => token.type),
		[TokenType.Number, TokenType.Plus, TokenType.Number, TokenType.End],
	);
	assert.equal(tokens[2].value, '22');
});

test('tokenizes parentheses and a decimal', () => {
	const tokens = new Tokenizer('(3.5)').tokenize();
	assert.deepEqual(
		tokens.map((token) => token.type),
		[TokenType.LeftParen, TokenType.Number, TokenType.RightParen, TokenType.End],
	);
	assert.equal(tokens[1].value, '3.5');
});

test('rejects an unexpected character', () => {
	assert.throws(() => new Tokenizer('1 ? 2').tokenize(), /unexpected character/);
});
