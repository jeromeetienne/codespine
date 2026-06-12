import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { GraphQuery } from '../src/query/graph_query.js';
import { GraphEdge } from '../src/schema/edge.js';
import { GraphNode } from '../src/schema/node.js';
import { KuzuStore } from '../src/store/kuzu_store.js';

/**
 * A four-function call chain `a → b → c → leaf` (each calls the next), so the
 * transitive inbound set of `leaf` is `{a, b, c}`. The backward `CALLS` walk
 * reaches `c` at one hop, `b` at two, `a` at three, which lets each test fix the
 * exact set a given `--depth` should return.
 */
const symbolId = (name: string, line: number): string => `Function:src/a.ts#${name}@${line}`;

const A = symbolId('a', 1);
const B = symbolId('b', 10);
const C = symbolId('c', 20);
const LEAF = symbolId('leaf', 30);

const node = (id: string, name: string, line: number): GraphNode => ({
	id,
	kind: 'Function',
	name,
	filePath: 'src/a.ts',
	range: { startLine: line, startColumn: 0, endLine: line + 5, endColumn: 1 },
	exported: true,
	metadata: {},
});

const callEdge = (from: string, to: string): GraphEdge => ({
	id: `CALLS:${from}->${to}`,
	kind: 'CALLS',
	from,
	to,
	metadata: { count: 1 },
});

const NODES: GraphNode[] = [
	node(A, 'a', 1),
	node(B, 'b', 10),
	node(C, 'c', 20),
	node(LEAF, 'leaf', 30),
];

const EDGES: GraphEdge[] = [
	callEdge(A, B),
	callEdge(B, C),
	callEdge(C, LEAF),
];

const withStore = async (fn: (query: GraphQuery) => Promise<void>): Promise<void> => {
	const dir = await mkdtemp(join(tmpdir(), 'tkg-blast-'));
	const store = new KuzuStore(join(dir, 'graph.kuzu'));
	await store.initSchema();
	await store.load(NODES, EDGES);
	try {
		await fn(new GraphQuery(store));
	} finally {
		await store.close();
		await rm(dir, { recursive: true, force: true });
	}
};

describe('GraphQuery.blastRadius depth clamping', () => {
	it('clamps a depth above Kùzu\'s variable-length bound rather than throwing at query time', async () => {
		await withStore(async (query) => {
			// depth 50 exceeds Kùzu's upper bound of 30 for a `*1..N` pattern; without
			// clamping this throws `Binder exception: Upper bound of rel e exceeds maximum: 30`.
			const impacted = await query.blastRadius(LEAF, 50);
			assert.deepEqual(impacted.map((ref) => ref.name), ['a', 'b', 'c']);
		});
	});

	it('honours a depth of 1, returning only the direct callers', async () => {
		await withStore(async (query) => {
			const impacted = await query.blastRadius(LEAF, 1);
			assert.deepEqual(impacted.map((ref) => ref.name), ['c']);
		});
	});
});
