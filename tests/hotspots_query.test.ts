import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { GraphQuery, HotspotMetric } from '../src/query/graph_query.js';
import { GraphEdge } from '../src/schema/edge.js';
import { GraphNode } from '../src/schema/node.js';
import { KuzuStore } from '../src/store/kuzu_store.js';

/**
 * A six-function call graph (plus the un-measured sinks `entry` and `helper`)
 * built so every metric yields a *distinct* order, which is what makes the
 * assertions prove the metric is actually being applied rather than coinciding:
 *
 *   entry → hot → warm → cold        (a chain, so blast-radius diverges from fan-in)
 *   entry,hot,warm → util            (util has many callers, few call sites)
 *   entry → loop  (count 30)         (loop has one caller, many call sites)
 *   entry,hot,warm,cold → helper     (helper has the most callers, but no runtime)
 */
const symbolId = (name: string, line: number): string => `Function:src/a.ts#${name}@${line}`;

const ENTRY = symbolId('entry', 1);
const HOT = symbolId('hot', 10);
const WARM = symbolId('warm', 20);
const COLD = symbolId('cold', 30);
const UTIL = symbolId('util', 40);
const LOOP = symbolId('loop', 50);
const HELPER = symbolId('helper', 60);

type Runtime = { selfMs: number; samples: number };

const node = (id: string, name: string, line: number, runtime?: Runtime): GraphNode => ({
	id,
	kind: 'Function',
	name,
	filePath: 'src/a.ts',
	range: { startLine: line, startColumn: 0, endLine: line + 5, endColumn: 1 },
	exported: true,
	metadata: runtime === undefined ? {} : { runtime: { source: 'v8-cpuprofile', ...runtime } },
});

const callEdge = (from: string, to: string, count: number): GraphEdge => ({
	id: `CALLS:${from}->${to}`,
	kind: 'CALLS',
	from,
	to,
	metadata: { count },
});

const EDGES: GraphEdge[] = [
	callEdge(ENTRY, HOT, 1),
	callEdge(HOT, WARM, 1),
	callEdge(WARM, COLD, 1),
	callEdge(ENTRY, UTIL, 1),
	callEdge(HOT, UTIL, 1),
	callEdge(WARM, UTIL, 1),
	callEdge(ENTRY, LOOP, 30),
	callEdge(ENTRY, HELPER, 1),
	callEdge(HOT, HELPER, 1),
	callEdge(WARM, HELPER, 1),
	callEdge(COLD, HELPER, 1),
];

const measuredNodes = (): GraphNode[] => [
	node(ENTRY, 'entry', 1),
	node(HOT, 'hot', 10, { selfMs: 100, samples: 200 }),
	node(WARM, 'warm', 20, { selfMs: 40, samples: 20 }),
	node(COLD, 'cold', 30, { selfMs: 10, samples: 5 }),
	node(UTIL, 'util', 40, { selfMs: 5, samples: 80 }),
	node(LOOP, 'loop', 50, { selfMs: 2, samples: 3 }),
	node(HELPER, 'helper', 60),
];

const plainNodes = (): GraphNode[] => measuredNodes().map((graphNode) => ({ ...graphNode, metadata: {} }));

const withStore = async (
	nodes: GraphNode[],
	fn: (query: GraphQuery) => Promise<void>,
): Promise<void> => {
	const dir = await mkdtemp(join(tmpdir(), 'tkg-hotspots-'));
	const store = new KuzuStore(join(dir, 'graph.kuzu'));
	await store.initSchema();
	await store.load(nodes, EDGES);
	try {
		await fn(new GraphQuery(store));
	} finally {
		await store.close();
		await rm(dir, { recursive: true, force: true });
	}
};

const names = (query: GraphQuery, by: HotspotMetric, measuredOnly = false): Promise<string[]> =>
	query.hotspots({ by, measuredOnly }).then((report) => report.hotspots.map((hotspot) => hotspot.name));

describe('GraphQuery.hotspots ranking', () => {
	it('ranks by runtime self-time, omitting un-measured nodes', async () => {
		await withStore(measuredNodes(), async (query) => {
			assert.deepEqual(await names(query, 'self-time'), ['hot', 'warm', 'cold', 'util', 'loop']);
		});
	});

	it('ranks by profiler samples, a different order than self-time', async () => {
		await withStore(measuredNodes(), async (query) => {
			assert.deepEqual(await names(query, 'samples'), ['hot', 'util', 'warm', 'cold', 'loop']);
		});
	});

	it('ranks by callers (inbound CALLS fan-in)', async () => {
		await withStore(measuredNodes(), async (query) => {
			assert.deepEqual(await names(query, 'callers'), ['helper', 'util', 'hot', 'warm', 'cold', 'loop']);
		});
	});

	it('ranks by call-count (sum of inbound call-site counts), surfacing the hot loop', async () => {
		await withStore(measuredNodes(), async (query) => {
			assert.deepEqual(await names(query, 'call-count'), ['loop', 'helper', 'util', 'hot', 'warm', 'cold']);
		});
	});

	it('ranks by blast-radius (transitive inbound reach), surfacing the chain tail', async () => {
		await withStore(measuredNodes(), async (query) => {
			assert.deepEqual(await names(query, 'blast-radius'), ['helper', 'cold', 'util', 'warm', 'hot', 'loop']);
		});
	});

	it('carries the score and metric on each hotspot', async () => {
		await withStore(measuredNodes(), async (query) => {
			const report = await query.hotspots({ by: 'callers' });
			assert.deepEqual(report.hotspots[0], {
				id: HELPER,
				kind: 'Function',
				name: 'helper',
				filePath: 'src/a.ts',
				startLine: 60,
				metadata: {},
				score: 4,
				metric: 'callers',
			});
			assert.equal(report.metric, 'callers');
			assert.equal(report.requested, 'callers');
		});
	});

	it('honours --limit', async () => {
		await withStore(measuredNodes(), async (query) => {
			const report = await query.hotspots({ by: 'self-time', limit: 2 });
			assert.deepEqual(report.hotspots.map((hotspot) => hotspot.name), ['hot', 'warm']);
		});
	});

	it('restricts to measured nodes under measuredOnly, dropping the un-measured helper', async () => {
		await withStore(measuredNodes(), async (query) => {
			assert.deepEqual(await names(query, 'callers', true), ['util', 'hot', 'warm', 'cold', 'loop']);
		});
	});
});

describe('GraphQuery.hotspots defaults and fallback', () => {
	it('defaults to self-time on an enriched graph', async () => {
		await withStore(measuredNodes(), async (query) => {
			const report = await query.hotspots();
			assert.equal(report.enriched, true);
			assert.equal(report.metric, 'self-time');
			assert.equal(report.fellBack, false);
			assert.deepEqual(report.hotspots.map((hotspot) => hotspot.name), ['hot', 'warm', 'cold', 'util', 'loop']);
		});
	});

	it('defaults to callers on an un-enriched graph', async () => {
		await withStore(plainNodes(), async (query) => {
			const report = await query.hotspots();
			assert.equal(report.enriched, false);
			assert.equal(report.metric, 'callers');
			assert.equal(report.fellBack, false);
			assert.deepEqual(report.hotspots.map((hotspot) => hotspot.name), ['helper', 'util', 'hot', 'warm', 'cold', 'loop']);
		});
	});

	it('falls back to callers (not empty) when a runtime metric is requested on an un-enriched graph', async () => {
		await withStore(plainNodes(), async (query) => {
			const report = await query.hotspots({ by: 'self-time' });
			assert.equal(report.requested, 'self-time');
			assert.equal(report.metric, 'callers');
			assert.equal(report.fellBack, true);
			assert.equal(report.hotspots.length, 6);
			assert.equal(report.hotspots[0].name, 'helper');
		});
	});
});
