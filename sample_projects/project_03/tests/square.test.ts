import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Square } from '../src/shapes/square.js';

test('square area is the side squared', () => {
	assert.equal(new Square({ x: 0, y: 0 }, 5).area(), 25);
});

test('square inherits the rectangle bounding box', () => {
	assert.deepEqual(new Square({ x: 0, y: 0 }, 5).boundingBox(), {
		min: { x: 0, y: 0 },
		max: { x: 5, y: 5 },
	});
});

test('square describes itself as a Square', () => {
	assert.equal(new Square({ x: 0, y: 0 }, 5).describe(), 'Square with area 25.00');
});
