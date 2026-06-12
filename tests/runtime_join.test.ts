import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FrameSample } from '../src/enrich/cpu_profile.js';
import { RuntimeJoin, RuntimeTargetNode } from '../src/enrich/runtime_join.js';

const NODES: RuntimeTargetNode[] = [
	{ id: 'Module:src/a.ts', kind: 'Module', name: 'src/a.ts', filePath: 'src/a.ts', startLine: 0, endLine: 0 },
	{ id: 'Method:src/a.ts#render@5', kind: 'Method', name: 'render', filePath: 'src/a.ts', startLine: 5, endLine: 9 },
	{ id: 'Function:src/a.ts#slugify@12', kind: 'Function', name: 'slugify', filePath: 'src/a.ts', startLine: 12, endLine: 20 },
];

const ROOT = '/proj';

/** Builds a frame with sensible defaults so each test varies only what it asserts. */
function frame(partial: Partial<FrameSample>): FrameSample {
	return {
		functionName: '',
		url: 'file:///proj/src/a.ts',
		line: 0,
		column: 0,
		samples: 1,
		selfMicros: 1000,
		...partial,
	};
}

describe('RuntimeJoin name-aware resolution', () => {
	it('matches by name when the line is collapsed (transpiled run)', () => {
		// lineNumber 0 + 1 -> line 1, which encloses no function: only the name saves it.
		const result = RuntimeJoin.join(NODES, [frame({ functionName: 'slugify', line: 1 })], { root: ROOT });
		assert.equal(result.matchedByName, 1);
		assert.equal(result.matchedByRange, 0);
		assert.equal(result.attributions.get('Function:src/a.ts#slugify@12')?.samples, 1);
	});

	it('matches a dotted Class.method frame to the bare method node', () => {
		const result = RuntimeJoin.join(NODES, [frame({ functionName: 'Widget.render', line: 1 })], { root: ROOT });
		assert.equal(result.matchedByName, 1);
		assert.equal(result.attributions.get('Method:src/a.ts#render@5')?.samples, 1);
	});

	it('falls back to enclosing range when the frame has no usable name', () => {
		// An anonymous frame inside slugify's body on a real line.
		const result = RuntimeJoin.join(NODES, [frame({ functionName: '(anonymous)', line: 15 })], { root: ROOT });
		assert.equal(result.matchedByName, 0);
		assert.equal(result.matchedByRange, 1);
		assert.equal(result.attributions.get('Function:src/a.ts#slugify@12')?.samples, 1);
	});

	it('drops a name tie that the collapsed line cannot break', () => {
		const dupNodes: RuntimeTargetNode[] = [
			{ id: 'Function:src/a.ts#dup@3', kind: 'Function', name: 'dup', filePath: 'src/a.ts', startLine: 3, endLine: 6 },
			{ id: 'Function:src/a.ts#dup@9', kind: 'Function', name: 'dup', filePath: 'src/a.ts', startLine: 9, endLine: 12 },
		];
		const result = RuntimeJoin.join(dupNodes, [frame({ functionName: 'dup', line: 1 })], { root: ROOT });
		assert.equal(result.matchedFrames, 0);
		assert.equal(result.attributions.size, 0);
		const ambiguous = result.dropped.find((group) => group.reason === 'ambiguous');
		assert.notEqual(ambiguous, undefined);
		assert.equal(ambiguous?.samples, 1);
	});

	it('breaks a name tie by range when the line is real', () => {
		const dupNodes: RuntimeTargetNode[] = [
			{ id: 'Function:src/a.ts#dup@3', kind: 'Function', name: 'dup', filePath: 'src/a.ts', startLine: 3, endLine: 6 },
			{ id: 'Function:src/a.ts#dup@9', kind: 'Function', name: 'dup', filePath: 'src/a.ts', startLine: 9, endLine: 12 },
		];
		const result = RuntimeJoin.join(dupNodes, [frame({ functionName: 'dup', line: 10 })], { root: ROOT });
		assert.equal(result.matchedByName, 1);
		assert.equal(result.attributions.get('Function:src/a.ts#dup@9')?.samples, 1);
	});

	it('never name-matches a synthetic frame or the module node', () => {
		const result = RuntimeJoin.join(NODES, [
			frame({ functionName: '(root)', url: '', line: 1 }),
			frame({ functionName: 'src/a.ts', line: 1 }),
		], { root: ROOT });
		assert.equal(result.matchedFrames, 0);
		assert.equal(result.droppedFrames, 2);
	});

	it('attributes same-named methods in different files to their own node (project_03 area overrides)', () => {
		// Circle/Rectangle/Square each define `area()` in their own file. The url
		// selects the file; the name selects within it. Collapsed lines and a
		// shared method name must not cross-contaminate.
		const shapeNodes: RuntimeTargetNode[] = [
			{ id: 'Method:shapes/circle.ts#area@9', kind: 'Method', name: 'area', filePath: 'shapes/circle.ts', startLine: 9, endLine: 11 },
			{ id: 'Method:shapes/rectangle.ts#area@7', kind: 'Method', name: 'area', filePath: 'shapes/rectangle.ts', startLine: 7, endLine: 9 },
			{ id: 'Method:shapes/square.ts#area@14', kind: 'Method', name: 'area', filePath: 'shapes/square.ts', startLine: 14, endLine: 16 },
		];
		const frames = [
			frame({ functionName: 'area', url: 'file:///proj/shapes/circle.ts', line: 1, samples: 5 }),
			frame({ functionName: 'area', url: 'file:///proj/shapes/rectangle.ts', line: 1, samples: 3 }),
			frame({ functionName: 'area', url: 'file:///proj/shapes/square.ts', line: 1, samples: 2 }),
		];
		const result = RuntimeJoin.join(shapeNodes, frames, { root: ROOT });
		assert.equal(result.matchedByName, 3);
		assert.equal(result.attributions.get('Method:shapes/circle.ts#area@9')?.samples, 5);
		assert.equal(result.attributions.get('Method:shapes/rectangle.ts#area@7')?.samples, 3);
		assert.equal(result.attributions.get('Method:shapes/square.ts#area@14')?.samples, 2);
	});

	it('drops frames whose file is not in the graph', () => {
		const result = RuntimeJoin.join(NODES, [
			frame({ functionName: 'processTimers', url: 'node:internal/timers', line: 50, samples: 4 }),
		], { root: ROOT });
		assert.equal(result.matchedFrames, 0);
		const noFile = result.dropped.find((group) => group.reason === 'no-file');
		assert.equal(noFile?.samples, 4);
	});
});
