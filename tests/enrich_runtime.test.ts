import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { RuntimeEnricher } from '../src/enrich/runtime_enricher.js';
import { GraphQuery } from '../src/query/graph_query.js';
import { GraphNode } from '../src/schema/node.js';
import { KuzuStore } from '../src/store/kuzu_store.js';

const MODULE_ID = 'Module:src/a.ts';
const HOT_ID = 'Function:src/a.ts#hot@3';
const COLD_ID = 'Function:src/a.ts#cold@10';

const NODES: GraphNode[] = [
	{ id: MODULE_ID, kind: 'Module', name: 'src/a.ts', filePath: 'src/a.ts' },
	{
		id: HOT_ID,
		kind: 'Function',
		name: 'hot',
		filePath: 'src/a.ts',
		range: { startLine: 3, startColumn: 0, endLine: 8, endColumn: 1 },
		exported: true,
		metadata: { owner: 'team-a' },
	},
	{
		id: COLD_ID,
		kind: 'Function',
		name: 'cold',
		filePath: 'src/a.ts',
		range: { startLine: 10, startColumn: 0, endLine: 14, endColumn: 1 },
		exported: true,
	},
];

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/sample.cpuprofile', import.meta.url));
const PROFILE_ROOT = '/proj';

describe('RuntimeEnricher CPU-profile ingestion', () => {
	let dir: string;
	let store: KuzuStore;
	let profileText: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'tkg-enrich-'));
		store = new KuzuStore(join(dir, 'graph.kuzu'));
		await store.initSchema();
		await store.load(NODES, []);
		profileText = await readFile(FIXTURE_PATH, 'utf8');
	});

	afterEach(async () => {
		await store.close();
		await rm(dir, { recursive: true, force: true });
	});

	it('attaches self time and sample count to the enclosing node', async () => {
		const report = await RuntimeEnricher.enrich(store, profileText, { root: PROFILE_ROOT });
		assert.equal(report.matchedNodes, 2);

		const query = new GraphQuery(store);
		const hot = (await query.find('hot'))[0];
		assert.deepEqual(hot.metadata.runtime, {
			source: 'v8-cpuprofile',
			samples: 3,
			selfMicros: 300,
			selfMs: 0.3,
		});

		const cold = (await query.find('cold'))[0];
		assert.deepEqual(cold.metadata.runtime, {
			source: 'v8-cpuprofile',
			samples: 1,
			selfMicros: 100,
			selfMs: 0.1,
		});
	});

	it('preserves existing metadata while adding the runtime key', async () => {
		await RuntimeEnricher.enrich(store, profileText, { root: PROFILE_ROOT });
		const query = new GraphQuery(store);
		const hot = (await query.find('hot'))[0];
		assert.equal(hot.metadata.owner, 'team-a');
		assert.notEqual(hot.metadata.runtime, undefined);
	});

	it('reports out-of-project frames as dropped instead of attaching them', async () => {
		const report = await RuntimeEnricher.enrich(store, profileText, { root: PROFILE_ROOT });
		assert.equal(report.totalSamples, 6);
		assert.equal(report.matchedSamples, 4);
		assert.equal(report.droppedSamples, 2);
		const internal = report.dropped.find((group) => group.label.includes('processTimers'));
		assert.notEqual(internal, undefined);
		assert.equal(internal?.samples, 2);
		assert.equal(internal?.reason, 'no-file');
	});

	it('is idempotent for the runtime key across re-runs', async () => {
		const first = await RuntimeEnricher.enrich(store, profileText, { root: PROFILE_ROOT });
		const second = await RuntimeEnricher.enrich(store, profileText, { root: PROFILE_ROOT });
		assert.deepEqual(second, first);

		const query = new GraphQuery(store);
		const hot = (await query.find('hot'))[0];
		assert.deepEqual(hot.metadata.runtime, {
			source: 'v8-cpuprofile',
			samples: 3,
			selfMicros: 300,
			selfMs: 0.3,
		});
	});

	it('attaches nothing to the range-less module node', async () => {
		await RuntimeEnricher.enrich(store, profileText, { root: PROFILE_ROOT });
		const query = new GraphQuery(store);
		const module = (await query.neighborhood(MODULE_ID));
		assert.equal(module.length, 0);
		const nodes = await store.readNodes();
		const moduleNode = nodes.find((node) => node.id === MODULE_ID);
		assert.equal(moduleNode?.metadata.runtime, undefined);
	});
});
