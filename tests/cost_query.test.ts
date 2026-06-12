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
 * Cost-propagation fixtures, each shaped so the expected inclusive cost is exact
 * (no float wobble) and verifies a specific property of the model:
 *
 *   diamond   a→b, a→c, b→d, c→d   only d measured — conservation, no double-count
 *   weighted  x→z (×3), y→z (×1)   call-count-proportional partition
 *   cycle     a↔b, c→a             SCC collapse, terminating, cycle-total sharing
 */
const symbolId = (name: string, line: number): string => `Function:src/a.ts#${name}@${line}`;

type Runtime = { selfMs: number; samples: number };

const node = (name: string, line: number, runtime?: Runtime): GraphNode => ({
	id: symbolId(name, line),
	kind: 'Function',
	name,
	filePath: 'src/a.ts',
	range: { startLine: line, startColumn: 0, endLine: line + 5, endColumn: 1 },
	exported: true,
	metadata: runtime === undefined ? {} : { runtime: { source: 'v8-cpuprofile', ...runtime } },
});

const callEdge = (fromName: string, fromLine: number, toName: string, toLine: number, count = 1): GraphEdge => ({
	id: `CALLS:${fromName}->${toName}`,
	kind: 'CALLS',
	from: symbolId(fromName, fromLine),
	to: symbolId(toName, toLine),
	metadata: { count },
});

const DIAMOND_NODES: GraphNode[] = [
	node('a', 1),
	node('b', 10),
	node('c', 20),
	node('d', 30, { selfMs: 10, samples: 10 }),
];

const DIAMOND_EDGES: GraphEdge[] = [
	callEdge('a', 1, 'b', 10),
	callEdge('a', 1, 'c', 20),
	callEdge('b', 10, 'd', 30),
	callEdge('c', 20, 'd', 30),
];

const WEIGHTED_NODES: GraphNode[] = [
	node('x', 1),
	node('y', 10),
	node('z', 20, { selfMs: 8, samples: 8 }),
];

const WEIGHTED_EDGES: GraphEdge[] = [
	callEdge('x', 1, 'z', 20, 3),
	callEdge('y', 10, 'z', 20, 1),
];

const CYCLE_NODES: GraphNode[] = [
	node('a', 1, { selfMs: 4, samples: 4 }),
	node('b', 10, { selfMs: 6, samples: 6 }),
	node('c', 20),
];

const CYCLE_EDGES: GraphEdge[] = [
	callEdge('a', 1, 'b', 10),
	callEdge('b', 10, 'a', 1),
	callEdge('c', 20, 'a', 1),
];

const withStore = async (
	nodes: GraphNode[],
	edges: GraphEdge[],
	fn: (query: GraphQuery) => Promise<void>,
): Promise<void> => {
	const dir = await mkdtemp(join(tmpdir(), 'tkg-cost-'));
	const store = new KuzuStore(join(dir, 'graph.kuzu'));
	await store.initSchema();
	await store.load(nodes, edges);
	try {
		await fn(new GraphQuery(store));
	} finally {
		await store.close();
		await rm(dir, { recursive: true, force: true });
	}
};

const inclusiveByName = (query: GraphQuery): Promise<Map<string, number>> =>
	query.costRanking().then((report) => new Map(report.nodes.map((node) => [node.name, node.inclusiveCost])));

describe('GraphQuery.costRanking propagation', () => {
	it('propagates self cost into inclusive cost, conserving it across a diamond', async () => {
		await withStore(DIAMOND_NODES, DIAMOND_EDGES, async (query) => {
			const inclusive = await inclusiveByName(query);
			assert.equal(inclusive.get('a'), 10);
			assert.equal(inclusive.get('b'), 5);
			assert.equal(inclusive.get('c'), 5);
			assert.equal(inclusive.get('d'), 10);
		});
	});

	it('ranks by inclusive cost descending, tie-broken by location', async () => {
		await withStore(DIAMOND_NODES, DIAMOND_EDGES, async (query) => {
			const report = await query.costRanking();
			assert.deepEqual(report.nodes.map((node) => node.name), ['a', 'd', 'b', 'c']);
		});
	});

	it('reports the root as responsible for 100% of total self cost', async () => {
		await withStore(DIAMOND_NODES, DIAMOND_EDGES, async (query) => {
			const report = await query.costRanking();
			assert.equal(report.totalSelf, 10);
			const a = report.nodes.find((node) => node.name === 'a');
			assert.equal(a?.shareOfTotal, 1);
		});
	});

	it('keeps self cost distinct from inclusive cost for a fast caller of a hot callee', async () => {
		await withStore(DIAMOND_NODES, DIAMOND_EDGES, async (query) => {
			const report = await query.costRanking();
			const a = report.nodes.find((node) => node.name === 'a');
			assert.equal(a?.selfCost, 0);
			assert.equal(a?.inclusiveCost, 10);
		});
	});

	it('partitions a callee cost among callers by call-count share, not evenly', async () => {
		await withStore(WEIGHTED_NODES, WEIGHTED_EDGES, async (query) => {
			const inclusive = await inclusiveByName(query);
			assert.equal(inclusive.get('x'), 6);
			assert.equal(inclusive.get('y'), 2);
			assert.equal(inclusive.get('z'), 8);
		});
	});

	it('propagates the samples metric independently of self-time', async () => {
		await withStore(WEIGHTED_NODES, WEIGHTED_EDGES, async (query) => {
			const report = await query.costRanking({ by: 'samples' });
			assert.equal(report.metric, 'samples');
			const inclusive = new Map(report.nodes.map((node) => [node.name, node.inclusiveCost]));
			assert.equal(inclusive.get('x'), 6);
		});
	});

	it('handles call cycles without diverging, flagging members and sharing the cycle total', async () => {
		await withStore(CYCLE_NODES, CYCLE_EDGES, async (query) => {
			const report = await query.costRanking();
			const byName = new Map(report.nodes.map((node) => [node.name, node]));
			assert.equal(byName.get('a')?.cyclic, true);
			assert.equal(byName.get('b')?.cyclic, true);
			assert.equal(byName.get('a')?.cycleSize, 2);
			assert.equal(byName.get('a')?.inclusiveCost, 10);
			assert.equal(byName.get('b')?.inclusiveCost, 10);
			assert.equal(byName.get('c')?.inclusiveCost, 10);
			assert.equal(byName.get('c')?.cyclic, false);
		});
	});

	it('returns an empty ranking on an un-enriched graph rather than throwing', async () => {
		const plain = DIAMOND_NODES.map((graphNode) => ({ ...graphNode, metadata: {} }));
		await withStore(plain, DIAMOND_EDGES, async (query) => {
			const report = await query.costRanking();
			assert.equal(report.enriched, false);
			assert.equal(report.totalSelf, 0);
			assert.deepEqual(report.nodes, []);
		});
	});

	it('honours --limit and keeps shareOfTotal within [0, 1]', async () => {
		await withStore(DIAMOND_NODES, DIAMOND_EDGES, async (query) => {
			const report = await query.costRanking({ limit: 2 });
			assert.equal(report.nodes.length, 2);
			for (const ranked of report.nodes) {
				assert.ok(ranked.shareOfTotal >= 0 && ranked.shareOfTotal <= 1);
			}
		});
	});
});

describe('GraphQuery.costAttribution breakdown', () => {
	it('splits a node cost into callee flows whose shares plus self share sum to one', async () => {
		await withStore(DIAMOND_NODES, DIAMOND_EDGES, async (query) => {
			const attribution = await query.costAttribution(symbolId('a', 1));
			assert.equal(attribution.node?.name, 'a');
			const calleeAmounts = new Map(attribution.callees.map((flow) => [flow.name, flow.amount]));
			assert.equal(calleeAmounts.get('b'), 5);
			assert.equal(calleeAmounts.get('c'), 5);
			const calleeShare = attribution.callees.reduce((sum, flow) => sum + flow.share, 0);
			const selfShare = (attribution.node?.selfCost ?? 0) / (attribution.node?.inclusiveCost ?? 1);
			assert.ok(Math.abs(calleeShare + selfShare - 1) < 1e-9);
			assert.deepEqual(attribution.callers, []);
		});
	});

	it('attributes a node cost back to its callers by call-count share', async () => {
		await withStore(WEIGHTED_NODES, WEIGHTED_EDGES, async (query) => {
			const attribution = await query.costAttribution(symbolId('z', 20));
			const callerShares = new Map(attribution.callers.map((flow) => [flow.name, flow.share]));
			assert.equal(callerShares.get('x'), 0.75);
			assert.equal(callerShares.get('y'), 0.25);
			const callerAmounts = new Map(attribution.callers.map((flow) => [flow.name, flow.amount]));
			assert.equal(callerAmounts.get('x'), 6);
			assert.equal(callerAmounts.get('y'), 2);
		});
	});

	it('returns node: null for an unknown id', async () => {
		await withStore(DIAMOND_NODES, DIAMOND_EDGES, async (query) => {
			const attribution = await query.costAttribution('Function:src/a.ts#nope@999');
			assert.equal(attribution.node, null);
			assert.deepEqual(attribution.callees, []);
			assert.deepEqual(attribution.callers, []);
		});
	});
});
