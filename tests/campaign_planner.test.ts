import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CampaignPlanner } from '../src/query/campaign_planner.js';
import { GraphQuery } from '../src/query/graph_query.js';
import { GraphEdge } from '../src/schema/edge.js';
import { GraphNode } from '../src/schema/node.js';
import { KuzuStore } from '../src/store/kuzu_store.js';

/**
 * A tiny graph built so the planner's three readiness tiers are all exercised:
 *
 *   root → mid → deep        (a CALLS chain, so deep's transitive inbound blast
 *                             radius is 2 and mid's is 1)
 *   orphanOne, orphanTwo     (exported, zero inbound references — the safe removals)
 *
 * `root` is un-exported, so it is neither a dead export nor (un-measured) a hotspot.
 * `mid` and `deep` carry runtime, so they rank as hotspots; the blast-radius
 * ceiling decides whether each is `needs-workload` or `manual`.
 */
const symbolId = (name: string, line: number): string => `Function:src/a.ts#${name}@${line}`;

const ROOT = symbolId('root', 1);
const MID = symbolId('mid', 10);
const DEEP = symbolId('deep', 20);
const ORPHAN_ONE = symbolId('orphanOne', 70);
const ORPHAN_TWO = symbolId('orphanTwo', 80);

type Runtime = { selfMs: number; samples: number };

const node = (id: string, name: string, line: number, exported: boolean, runtime?: Runtime): GraphNode => ({
	id,
	kind: 'Function',
	name,
	filePath: 'src/a.ts',
	range: { startLine: line, startColumn: 0, endLine: line + 5, endColumn: 1 },
	exported,
	metadata: runtime === undefined ? {} : { runtime: { source: 'v8-cpuprofile', ...runtime } },
});

const callEdge = (from: string, to: string): GraphEdge => ({
	id: `CALLS:${from}->${to}`,
	kind: 'CALLS',
	from,
	to,
	metadata: { count: 1 },
});

const EDGES: GraphEdge[] = [
	callEdge(ROOT, MID),
	callEdge(MID, DEEP),
];

const measuredNodes = (): GraphNode[] => [
	node(ROOT, 'root', 1, false),
	node(MID, 'mid', 10, true, { selfMs: 50, samples: 50 }),
	node(DEEP, 'deep', 20, true, { selfMs: 100, samples: 100 }),
	node(ORPHAN_ONE, 'orphanOne', 70, true),
	node(ORPHAN_TWO, 'orphanTwo', 80, true),
];

const plainNodes = (): GraphNode[] => measuredNodes().map((graphNode) => ({ ...graphNode, metadata: {} }));

const withStore = async (nodes: GraphNode[], fn: (query: GraphQuery) => Promise<void>): Promise<void> => {
	const dir = await mkdtemp(join(tmpdir(), 'tkg-campaign-'));
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

describe('CampaignPlanner.plan', () => {
	it('ranks safe removals first, then bounds hotspots by blast radius', async () => {
		await withStore(measuredNodes(), async (query) => {
			const report = await CampaignPlanner.plan(query, { maxBlastRadius: 1 });
			assert.equal(report.enriched, true);
			assert.equal(report.metric, 'self-time');
			assert.equal(report.fellBack, false);
			assert.equal(report.maxBlastRadius, 1);
			assert.deepEqual(report.items.map((item) => item.name), ['orphanOne', 'orphanTwo', 'mid', 'deep']);
			assert.deepEqual(report.items.map((item) => item.readiness), ['auto-applicable', 'auto-applicable', 'needs-workload', 'manual']);
			assert.deepEqual(report.items.map((item) => item.blastRadius), [0, 0, 1, 2]);
		});
	});

	it('tags dead exports as auto-applicable removals and hotspots with their metric', async () => {
		await withStore(measuredNodes(), async (query) => {
			const report = await CampaignPlanner.plan(query, { maxBlastRadius: 1 });
			const removal = report.items.find((item) => item.name === 'orphanOne');
			assert.equal(removal?.candidate, 'dead-export');
			assert.equal(removal?.readiness, 'auto-applicable');
			assert.equal(removal?.score, 0);
			assert.equal(removal?.metric, null);
			const hotspot = report.items.find((item) => item.name === 'deep');
			assert.equal(hotspot?.candidate, 'hotspot');
			assert.equal(hotspot?.metric, 'self-time');
			assert.equal(hotspot?.score, 100);
		});
	});

	it('orders hotspots by leverage when the blast-radius ceiling admits them', async () => {
		await withStore(measuredNodes(), async (query) => {
			const report = await CampaignPlanner.plan(query, { maxBlastRadius: 5 });
			assert.deepEqual(report.items.map((item) => item.name), ['orphanOne', 'orphanTwo', 'deep', 'mid']);
			assert.deepEqual(report.items.map((item) => item.readiness), ['auto-applicable', 'auto-applicable', 'needs-workload', 'needs-workload']);
		});
	});

	it('truncates to --limit, keeping the safe removals first', async () => {
		await withStore(measuredNodes(), async (query) => {
			const report = await CampaignPlanner.plan(query, { maxBlastRadius: 5, limit: 3 });
			assert.deepEqual(report.items.map((item) => item.name), ['orphanOne', 'orphanTwo', 'deep']);
		});
	});

	it('falls back to static fan-in on an un-enriched graph and flags it', async () => {
		await withStore(plainNodes(), async (query) => {
			const report = await CampaignPlanner.plan(query, { by: 'self-time', maxBlastRadius: 5 });
			assert.equal(report.enriched, false);
			assert.equal(report.metric, 'callers');
			assert.equal(report.fellBack, true);
			const hotspotNames = report.items.filter((item) => item.candidate === 'hotspot').map((item) => item.name).sort();
			assert.deepEqual(hotspotNames, ['deep', 'mid']);
		});
	});
});
