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

function edgesBetween(edges: GraphEdge[], kind: string, fromMarker: string, toMarker: string): GraphEdge[] {
	return edges.filter((edge) =>
		edge.kind === kind && edge.from.includes(fromMarker) && edge.to.includes(toMarker));
}

describe('WRITES edge emission', () => {
	it('emits WRITES from the writing scope to a module-level variable', () => {
		const edges = buildEdges(`
export let counter = 0;
export function bump(): void { counter = 1; }
`);
		assert.equal(edgesBetween(edges, 'WRITES', '#bump@', '#counter@').length, 1);
	});

	it('collapses repeated writes into one counted edge', () => {
		const edges = buildEdges(`
export let counter = 0;
export function reset(): void { counter = 0; counter = 1; }
`);
		const writes = edgesBetween(edges, 'WRITES', '#reset@', '#counter@');
		assert.equal(writes.length, 1);
		assert.equal(writes[0].metadata?.count, 2);
	});

	it('does not emit WRITES for a pure read', () => {
		const edges = buildEdges(`
export const SOURCE = 5;
export function read(): number { return SOURCE + 1; }
`);
		assert.equal(edgesBetween(edges, 'WRITES', '#read@', '#SOURCE@').length, 0);
		assert.equal(edgesBetween(edges, 'READS', '#read@', '#SOURCE@').length, 1);
	});
});

describe('READS / WRITES split for assignments', () => {
	it('treats a plain assignment as a write only, not a read', () => {
		const edges = buildEdges(`
export let flag = false;
export function enable(): void { flag = true; }
`);
		assert.equal(edgesBetween(edges, 'WRITES', '#enable@', '#flag@').length, 1);
		assert.equal(edgesBetween(edges, 'READS', '#enable@', '#flag@').length, 0);
	});

	it('reports a compound assignment as both a read and a write', () => {
		const edges = buildEdges(`
export let total = 0;
export function add(): void { total += 5; }
`);
		assert.equal(edgesBetween(edges, 'WRITES', '#add@', '#total@').length, 1);
		assert.equal(edgesBetween(edges, 'READS', '#add@', '#total@').length, 1);
	});

	it('reports an increment as both a read and a write', () => {
		const edges = buildEdges(`
export let ticks = 0;
export function tick(): void { ticks++; }
`);
		assert.equal(edgesBetween(edges, 'WRITES', '#tick@', '#ticks@').length, 1);
		assert.equal(edgesBetween(edges, 'READS', '#tick@', '#ticks@').length, 1);
	});

	it('reads the right-hand side while writing the left', () => {
		const edges = buildEdges(`
export let target = 0;
export const SOURCE = 5;
export function copy(): void { target = SOURCE; }
`);
		assert.equal(edgesBetween(edges, 'WRITES', '#copy@', '#target@').length, 1);
		assert.equal(edgesBetween(edges, 'READS', '#copy@', '#target@').length, 0);
		assert.equal(edgesBetween(edges, 'READS', '#copy@', '#SOURCE@').length, 1);
	});
});
