import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Circle } from '../src/shapes/circle.js';

test('circle area is pi r squared', () => {
	const circle = new Circle({ x: 0, y: 0 }, 2);
	assert.ok(Math.abs(circle.area() - Math.PI * 4) < 1e-9);
});

test('circle bounding box spans the diameter', () => {
	const circle = new Circle({ x: 1, y: 1 }, 3);
	assert.deepEqual(circle.boundingBox(), {
		min: { x: -2, y: -2 },
		max: { x: 4, y: 4 },
	});
});

test('circle renders its radius', () => {
	assert.equal(new Circle({ x: 0, y: 0 }, 5).render(), 'Circle(r=5)');
});
