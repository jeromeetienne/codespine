import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rectangle } from '../src/shapes/rectangle.js';

test('rectangle area is width times height', () => {
	assert.equal(new Rectangle({ x: 0, y: 0 }, 3, 4).area(), 12);
});

test('rectangle bounding box matches its extent', () => {
	assert.deepEqual(new Rectangle({ x: 1, y: 2 }, 3, 4).boundingBox(), {
		min: { x: 1, y: 2 },
		max: { x: 4, y: 6 },
	});
});

test('rectangle describes its area', () => {
	assert.equal(new Rectangle({ x: 0, y: 0 }, 3, 4).describe(), 'Rectangle with area 12.00');
});
