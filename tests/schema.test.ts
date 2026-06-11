import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GraphEdgeSchema } from '../src/schema/edge.js';
import { GraphNode, GraphNodeSchema } from '../src/schema/node.js';

describe('GraphNodeSchema', () => {
	it('accepts a minimal node', () => {
		const node = {
			id: 'Module:src/a.ts',
			kind: 'Module',
			name: 'a',
			filePath: 'src/a.ts',
		};
		assert.deepEqual(GraphNodeSchema.parse(node), node);
	});

	it('accepts a node with an optional range and exported flag', () => {
		const node: GraphNode = {
			id: 'Class:src/a.ts#A@1',
			kind: 'Class',
			name: 'A',
			filePath: 'src/a.ts',
			range: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 },
			exported: true,
		};
		assert.deepEqual(GraphNodeSchema.parse(node), node);
	});

	it('rejects an unknown node kind', () => {
		const node = {
			id: 'x',
			kind: 'Widget',
			name: 'x',
			filePath: 'src/a.ts',
		};
		assert.throws(() => GraphNodeSchema.parse(node));
	});

	it('rejects a node missing a required field', () => {
		const node = {
			id: 'x',
			kind: 'Module',
			name: 'x',
		};
		assert.throws(() => GraphNodeSchema.parse(node));
	});

	it('rejects a non-integer range value', () => {
		const node = {
			id: 'x',
			kind: 'Module',
			name: 'x',
			filePath: 'src/a.ts',
			range: { startLine: 1.5, startColumn: 0, endLine: 5, endColumn: 1 },
		};
		assert.throws(() => GraphNodeSchema.parse(node));
	});
});

describe('GraphEdgeSchema', () => {
	it('accepts a minimal edge', () => {
		const edge = {
			id: 'e1',
			kind: 'CONTAINS',
			from: 'Module:src/a.ts',
			to: 'Class:src/a.ts#A@1',
		};
		assert.deepEqual(GraphEdgeSchema.parse(edge), edge);
	});

	it('rejects an unknown edge kind', () => {
		const edge = {
			id: 'e1',
			kind: 'POINTS_AT',
			from: 'a',
			to: 'b',
		};
		assert.throws(() => GraphEdgeSchema.parse(edge));
	});
});
