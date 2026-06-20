import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Project } from 'ts-morph';
import { GraphBuilder } from '../src/extract/graph_builder.js';
import { GraphEdge } from '../src/schema/edge.js';
import { GraphNode } from '../src/schema/node.js';
import { KuzuStore } from '../src/store/kuzu_store.js';

/**
 * Runs the real extract pipeline over an in-memory source file, returning the
 * nodes and edges {@link GraphBuilder} produces — the same input `load` receives
 * from `edges.jsonl` in the CLI.
 */
function buildGraph(source: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const project = new Project({ useInMemoryFileSystem: true });
	project.createSourceFile('src/a.ts', source);
	const builder = new GraphBuilder();
	builder.build(project, '/', { semantic: true });
	return { nodes: builder.getNodes(), edges: builder.getEdges() };
}

async function edgeCount(store: KuzuStore): Promise<number> {
	const rows = await store.run('MATCH (:GraphNode)-[e:Edge]->(:GraphNode) RETURN count(e) AS c');
	return Number(rows[0].c);
}

async function nodeCount(store: KuzuStore): Promise<number> {
	const rows = await store.run('MATCH (n:GraphNode) RETURN count(n) AS c');
	return Number(rows[0].c);
}

describe('extract → load edge-count consistency (#153)', () => {
	let dir: string;
	let store: KuzuStore;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'tkg-load-count-'));
		store = new KuzuStore(join(dir, 'graph.kuzu'));
		await store.initSchema();
	});

	afterEach(async () => {
		await store.close();
		await rm(dir, { recursive: true, force: true });
	});

	it('reports an edge count equal to the edges that survive in the database', async () => {
		const { nodes, edges } = buildGraph(`
export function topLevel(): number { return 1; }
export function outer(): number {
	function inner(): number { return 1; }
	const localArrow = (): number => 2;
	const obj = { method(): number { return 3; } };
	return inner() + localArrow() + obj.method() + topLevel();
}
`);

		const danglingLocal = edges.filter((edge) =>
			edge.to.includes('#inner@') || edge.to.includes('#localArrow@') || edge.to.includes('#method@'));
		assert.deepEqual(danglingLocal, [], 'extractor must not emit edges to un-emitted local symbols');

		const loaded = await store.load(nodes, edges);
		const survivingEdges = await edgeCount(store);
		const survivingNodes = await nodeCount(store);

		assert.ok(survivingEdges > 0, 'fixture should produce at least one surviving edge');
		assert.equal(loaded.edges, survivingEdges, 'reported edge count must equal the database count');
		assert.equal(loaded.nodes, survivingNodes, 'reported node count must equal the database count');
	});

	it('drops an edge whose target was never emitted and excludes it from the reported count', async () => {
		const { nodes, edges } = buildGraph(`
export function callee(): void {}
export function caller(): void { callee(); }
`);
		const ghostEdge: GraphEdge = {
			id: `CALLS:${nodes[0].id}->Function:src/a.ts#ghost@99`,
			kind: 'CALLS',
			from: nodes[0].id,
			to: 'Function:src/a.ts#ghost@99',
		};

		const loaded = await store.load(nodes, [...edges, ghostEdge]);
		const survivingEdges = await edgeCount(store);

		assert.equal(loaded.edges, edges.length, 'the dangling edge must not be counted');
		assert.equal(loaded.edges, survivingEdges, 'reported edge count must equal the database count');
	});
});
