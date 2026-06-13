import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { GraphEdge } from '../src/schema/edge.js';
import { GraphNode } from '../src/schema/node.js';
import { SourceManifest } from '../src/schema/source_manifest.js';
import { JsonlReader } from '../src/store/jsonl_reader.js';
import { JsonlStore } from '../src/store/jsonl_store.js';

const NODES: GraphNode[] = [
	{ id: 'Module:src/a.ts', kind: 'Module', name: 'a', filePath: 'src/a.ts' },
	{
		id: 'Class:src/a.ts#A@1',
		kind: 'Class',
		name: 'A',
		filePath: 'src/a.ts',
		range: { startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 },
		exported: true,
	},
];

const EDGES: GraphEdge[] = [
	{ id: 'e1', kind: 'CONTAINS', from: 'Module:src/a.ts', to: 'Class:src/a.ts#A@1' },
];

describe('JsonlStore / JsonlReader round trip', () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'tkg-jsonl-'));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('reads back exactly what was written', async () => {
		await JsonlStore.write(dir, NODES, EDGES);
		const data = await JsonlReader.read(dir);
		assert.deepEqual(data.nodes, NODES);
		assert.deepEqual(data.edges, EDGES);
	});

	it('writes one JSON object per line and ends with a newline', async () => {
		await JsonlStore.write(dir, NODES, EDGES);
		const raw = await readFile(join(dir, 'nodes.jsonl'), 'utf8');
		assert.ok(raw.endsWith('\n'));
		const lines = raw.split('\n').filter((line) => line.trim().length > 0);
		assert.equal(lines.length, NODES.length);
		assert.deepEqual(JSON.parse(lines[0]), NODES[0]);
	});

	it('handles empty inputs', async () => {
		await JsonlStore.write(dir, [], []);
		const data = await JsonlReader.read(dir);
		assert.deepEqual(data.nodes, []);
		assert.deepEqual(data.edges, []);
	});

	it('round-trips the optional source manifest when provided', async () => {
		const source: SourceManifest = {
			baseUrl: 'https://github.com/owner/repo',
			commit: 'abc1234def5678',
			prefix: 'sample_projects/project_01/',
		};
		await JsonlStore.write(dir, NODES, EDGES, source);
		const data = await JsonlReader.read(dir);
		assert.deepEqual(data.source, source);
	});

	it('omits source.json and reads source as undefined when not provided', async () => {
		await JsonlStore.write(dir, NODES, EDGES);
		await assert.rejects(readFile(join(dir, 'source.json'), 'utf8'));
		const data = await JsonlReader.read(dir);
		assert.equal(data.source, undefined);
	});
});
