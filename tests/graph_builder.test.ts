import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Project } from 'ts-morph';
import { GraphBuilder } from '../src/extract/graph_builder.js';
import { GraphEdge } from '../src/schema/edge.js';

function buildEdges(source: string): GraphEdge[] {
	const project = new Project({ useInMemoryFileSystem: true });
	project.createSourceFile('src/a.ts', source);
	const builder = new GraphBuilder();
	builder.build(project, '/', { semantic: true });
	return builder.getEdges();
}

describe('GraphBuilder edge counting', () => {
	it('collapses repeated call sites into one edge counting the occurrences', () => {
		const edges = buildEdges(`
export function b(): void {}
export function a(): void { b(); b(); }
`);
		const calls = edges.filter((edge) => edge.kind === 'CALLS' && edge.from.includes('#a@') && edge.to.includes('#b@'));
		assert.equal(calls.length, 1);
		assert.equal(calls[0].metadata?.count, 2);
	});

	it('counts a single occurrence as 1', () => {
		const edges = buildEdges(`
export function b(): void {}
export function c(): void { b(); }
`);
		const calls = edges.filter((edge) => edge.kind === 'CALLS' && edge.from.includes('#c@') && edge.to.includes('#b@'));
		assert.equal(calls.length, 1);
		assert.equal(calls[0].metadata?.count, 1);
	});

	it('preserves pre-existing edge metadata alongside the count', () => {
		const edges = buildEdges(`
import { readFile } from 'node:fs';
export function a(): void { readFile; }
`);
		const imports = edges.filter((edge) => edge.kind === 'IMPORTS' && edge.metadata?.specifier === 'node:fs');
		assert.equal(imports.length, 1);
		assert.equal(imports[0].metadata?.count, 1);
	});
});
