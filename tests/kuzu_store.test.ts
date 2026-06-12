import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { GraphQuery } from '../src/query/graph_query.js';
import { GraphEdge } from '../src/schema/edge.js';
import { GraphNode } from '../src/schema/node.js';
import { KuzuStore } from '../src/store/kuzu_store.js';

const MODULE_ID = 'Module:src/a.ts';
const WIDGET_ID = 'Class:src/a.ts#Widget@1';

const NODES: GraphNode[] = [
	{ id: MODULE_ID, kind: 'Module', name: 'a', filePath: 'src/a.ts' },
	{
		id: WIDGET_ID,
		kind: 'Class',
		name: 'Widget',
		filePath: 'src/a.ts',
		range: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 },
		exported: true,
		metadata: { latencyMsP50: 12, owner: 'team-a' },
	},
	{
		id: 'Function:src/a.ts#helper@7',
		kind: 'Function',
		name: 'helper',
		filePath: 'src/a.ts',
		range: { startLine: 7, startColumn: 0, endLine: 9, endColumn: 1 },
	},
];

const EDGES: GraphEdge[] = [
	{
		id: `CONTAINS:${MODULE_ID}->${WIDGET_ID}`,
		kind: 'CONTAINS',
		from: MODULE_ID,
		to: WIDGET_ID,
		metadata: { count: 3 },
	},
];

describe('KuzuStore metadata round trip', () => {
	let dir: string;
	let store: KuzuStore;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'tkg-kuzu-'));
		store = new KuzuStore(join(dir, 'graph.kuzu'));
		await store.initSchema();
		await store.load(NODES, EDGES);
	});

	afterEach(async () => {
		await store.close();
		await rm(dir, { recursive: true, force: true });
	});

	it('round-trips node metadata through the store', async () => {
		const query = new GraphQuery(store);
		const refs = await query.find('Widget');
		assert.equal(refs.length, 1);
		assert.deepEqual(refs[0].metadata, { latencyMsP50: 12, owner: 'team-a' });
	});

	it('defaults a node with no metadata to an empty object', async () => {
		const query = new GraphQuery(store);
		const refs = await query.find('helper');
		assert.equal(refs.length, 1);
		assert.deepEqual(refs[0].metadata, {});
	});

	it('round-trips edge metadata through the store', async () => {
		const query = new GraphQuery(store);
		const neighbors = await query.neighborhood(MODULE_ID);
		const contained = neighbors.find((neighbor) => neighbor.id === WIDGET_ID && neighbor.direction === 'out');
		assert.notEqual(contained, undefined);
		assert.deepEqual(contained?.edgeMetadata, { count: 3 });
	});

	it('round-trips graph-level metadata, overwrites it, and clears it', async () => {
		assert.equal(await store.readGraphMeta('runtime'), null);
		await store.writeGraphMeta('runtime', { totalSamples: 100, matchedSamples: 80 });
		assert.deepEqual(await store.readGraphMeta('runtime'), { totalSamples: 100, matchedSamples: 80 });
		await store.writeGraphMeta('runtime', { totalSamples: 50 });
		assert.deepEqual(await store.readGraphMeta('runtime'), { totalSamples: 50 });
		await store.clearGraphMeta('runtime');
		assert.equal(await store.readGraphMeta('runtime'), null);
	});
});
