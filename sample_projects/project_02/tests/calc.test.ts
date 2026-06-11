import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calc } from '../src/calc.js';

test('respects operator precedence', () => {
	assert.equal(Calc.evaluate('1 + 2 * 3'), 7);
});

test('respects parentheses', () => {
	assert.equal(Calc.evaluate('(1 + 2) * 3'), 9);
});

test('handles unary minus and division', () => {
	assert.equal(Calc.evaluate('-4 + 10 / 2'), 1);
});

test('handles a nested expression', () => {
	assert.equal(Calc.evaluate('2 * (3 + 4) - 1'), 13);
});
