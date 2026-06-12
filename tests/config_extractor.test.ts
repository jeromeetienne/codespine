import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Project } from 'ts-morph';
import { GraphBuilder } from '../src/extract/graph_builder.js';
import { GraphQuery } from '../src/query/graph_query.js';
import { GraphEdge } from '../src/schema/edge.js';
import { GraphNode } from '../src/schema/node.js';
import { KuzuStore } from '../src/store/kuzu_store.js';

function build(source: string, semantic = false): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const project = new Project({ useInMemoryFileSystem: true });
	project.createSourceFile('src/a.ts', source);
	const builder = new GraphBuilder();
	builder.build(project, '/', { semantic });
	return { nodes: builder.getNodes(), edges: builder.getEdges() };
}

const configFlags = (nodes: GraphNode[]): GraphNode[] => nodes.filter((node) => node.kind === 'ConfigFlag');
const readsConfig = (edges: GraphEdge[]): GraphEdge[] => edges.filter((edge) => edge.kind === 'READS_CONFIG');

describe('ConfigFlag / process.env extraction', () => {
	it('emits a ConfigFlag node and a READS_CONFIG edge for process.env.X', () => {
		const { nodes, edges } = build('export function f(): string | undefined { return process.env.PORT; }');
		const flags = configFlags(nodes);
		assert.equal(flags.length, 1);
		assert.equal(flags[0].id, 'Config:PORT');
		assert.equal(flags[0].name, 'PORT');
		const reads = readsConfig(edges);
		assert.equal(reads.length, 1);
		assert.equal(reads[0].to, 'Config:PORT');
		assert.ok(reads[0].from.includes('#f@'));
	});

	it('detects the element-access form process.env["X"]', () => {
		const { nodes, edges } = build("export function f(): string | undefined { return process.env['PORT']; }");
		assert.equal(configFlags(nodes).length, 1);
		assert.equal(configFlags(nodes)[0].id, 'Config:PORT');
		assert.equal(readsConfig(edges).length, 1);
	});

	it('collapses many reads of one variable into a single node, counted per scope', () => {
		const { nodes, edges } = build("export function f(): string { return process.env.PORT + process.env['PORT']; }");
		assert.equal(configFlags(nodes).length, 1);
		const reads = readsConfig(edges);
		assert.equal(reads.length, 1);
		assert.equal(reads[0].metadata?.count, 2);
	});

	it('attributes a top-level read to the enclosing variable declaration', () => {
		const { edges } = build('export const PORT = process.env.PORT;');
		const reads = readsConfig(edges);
		assert.equal(reads.length, 1);
		assert.ok(reads[0].from.includes('#PORT@'));
		assert.equal(reads[0].to, 'Config:PORT');
	});

	it('attributes a read inside a method to that method', () => {
		const { edges } = build('export class S { start(): boolean { return process.env.DEBUG !== undefined; } }');
		const reads = readsConfig(edges);
		assert.equal(reads.length, 1);
		assert.ok(reads[0].from.includes('#start@'));
	});

	it('attributes a read in a nested function to the nearest emitted scope (no dropped edge)', () => {
		const { nodes, edges } = build(`
export function outer(): () => string | undefined {
	function inner(): string | undefined { return process.env.X; }
	return inner;
}
`);
		const reads = readsConfig(edges);
		assert.equal(reads.length, 1);
		assert.ok(reads[0].from.includes('#outer@'));
		assert.ok(nodes.some((node) => node.id === reads[0].from), 'the from-node must exist in the graph');
	});

	it('is emitted by the structural layer alone, without --semantic', () => {
		const { nodes } = build('export const X = process.env.X;', false);
		assert.equal(configFlags(nodes).length, 1);
	});

	it('ignores computed keys and leaves a process.env-free project unchanged', () => {
		const computed = build('export function f(k: string): string | undefined { return process.env[k]; }');
		assert.equal(configFlags(computed.nodes).length, 0);
		const none = build('export function f(): number { return 1 + 1; }');
		assert.equal(configFlags(none.nodes).length, 0);
		assert.equal(readsConfig(none.edges).length, 0);
	});
});

describe('ConfigFlag is queryable via find and neighbors', () => {
	let dir: string;
	let store: KuzuStore;

	beforeEach(async () => {
		const { nodes, edges } = build('export function readConfig(): string | undefined { return process.env.API_KEY; }');
		dir = await mkdtemp(join(tmpdir(), 'tkg-config-'));
		store = new KuzuStore(join(dir, 'graph.kuzu'));
		await store.initSchema();
		await store.load(nodes, edges);
	});

	afterEach(async () => {
		await store.close();
		await rm(dir, { recursive: true, force: true });
	});

	it('find locates the ConfigFlag by name', async () => {
		const refs = await new GraphQuery(store).find('API_KEY');
		assert.equal(refs.length, 1);
		assert.equal(refs[0].kind, 'ConfigFlag');
		assert.equal(refs[0].id, 'Config:API_KEY');
	});

	it('neighbors of the ConfigFlag lists the reading scope via READS_CONFIG', async () => {
		const neighbors = await new GraphQuery(store).neighborhood('Config:API_KEY');
		assert.equal(neighbors.length, 1);
		assert.equal(neighbors[0].edgeKind, 'READS_CONFIG');
		assert.equal(neighbors[0].direction, 'in');
		assert.equal(neighbors[0].name, 'readConfig');
	});
});
