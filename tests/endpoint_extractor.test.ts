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

function build(source: string, semantic = true): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const project = new Project({ useInMemoryFileSystem: true });
	project.createSourceFile('src/a.ts', source);
	const builder = new GraphBuilder();
	builder.build(project, '/', { semantic });
	return { nodes: builder.getNodes(), edges: builder.getEdges() };
}

const endpoints = (nodes: GraphNode[]): GraphNode[] => nodes.filter((node) => node.kind === 'Endpoint');
const handles = (edges: GraphEdge[]): GraphEdge[] => edges.filter((edge) => edge.kind === 'HANDLES');

describe('Endpoint / route extraction', () => {
	it('emits an Endpoint node and a HANDLES edge for a named-function route', () => {
		const { nodes, edges } = build(`
export function listUsers(req: unknown, res: unknown): void {}
export function routes(app: { get: (p: string, h: unknown) => void }): void {
	app.get('/users', listUsers);
}
`);
		const found = endpoints(nodes);
		assert.equal(found.length, 1);
		assert.equal(found[0].id, 'Endpoint:GET /users');
		assert.equal(found[0].name, 'GET /users');
		const handlesEdges = handles(edges);
		assert.equal(handlesEdges.length, 1);
		assert.equal(handlesEdges[0].from, 'Endpoint:GET /users');
		assert.ok(handlesEdges[0].to.includes('#listUsers@'));
	});

	it('resolves a const-arrow handler and a method handler', () => {
		const arrow = build(`
export const getUser = (req: unknown, res: unknown): void => {};
export function routes(r: { get: (p: string, h: unknown) => void }): void { r.get('/u/:id', getUser); }
`);
		assert.ok(handles(arrow.edges)[0]?.to.includes('#getUser@'));

		const method = build(`
class Ctrl { create(req: unknown, res: unknown): void {} }
const c = new Ctrl();
export function routes(r: { post: (p: string, h: unknown) => void }): void { r.post('/u', c.create); }
`);
		assert.ok(handles(method.edges)[0]?.to.includes('#create@'));
	});

	it('emits the Endpoint but no HANDLES for an inline handler', () => {
		const { nodes, edges } = build(`
export function routes(app: { get: (p: string, h: unknown) => void }): void {
	app.get('/ping', (req: unknown, res: { send: (b: string) => void }) => res.send('pong'));
}
`);
		assert.equal(endpoints(nodes).length, 1);
		assert.equal(endpoints(nodes)[0].id, 'Endpoint:GET /ping');
		assert.equal(handles(edges).length, 0);
	});

	it('handles every HTTP verb and takes the last argument as the handler', () => {
		const { nodes, edges } = build(`
export function h(req: unknown, res: unknown): void {}
function logger(): void {}
export function routes(r: { put: (p: string, h: unknown) => void; delete: (p: string, m: unknown, h: unknown) => void }): void {
	r.put('/a', () => {});
	r.delete('/b', logger, h);
}
`);
		const ids = endpoints(nodes).map((node) => node.id).sort();
		assert.deepEqual(ids, ['Endpoint:DELETE /b', 'Endpoint:PUT /a']);
		assert.ok(handles(edges).some((edge) => edge.from === 'Endpoint:DELETE /b' && edge.to.includes('#h@')));
	});

	it('ignores non-routes: one-arg .get, Map.get, and a non-handler last argument', () => {
		const { nodes } = build(`
export function routes(app: { get: (p: string) => void; post: (p: string, x: number) => void }): void {
	app.get('/setting');
	const m = new Map<string, number>();
	m.get('key');
	app.post('/skip', 42);
}
`);
		assert.equal(endpoints(nodes).length, 0);
	});

	it('is emitted only with --semantic, and leaves a route-free project unchanged', () => {
		const source = `
export function h(req: unknown, res: unknown): void {}
export function routes(app: { get: (p: string, h: unknown) => void }): void { app.get('/x', h); }
`;
		assert.equal(endpoints(build(source, false).nodes).length, 0);
		assert.equal(endpoints(build(source, true).nodes).length, 1);
		const none = build('export function f(): number { return 1; }', true);
		assert.equal(endpoints(none.nodes).length, 0);
		assert.equal(handles(none.edges).length, 0);
	});
});

describe('Endpoint is queryable, and HANDLES counts as a reference', () => {
	let dir: string;
	let store: KuzuStore;

	beforeEach(async () => {
		const { nodes, edges } = build(`
export function listUsers(req: unknown, res: unknown): void {}
export function routes(app: { get: (p: string, h: unknown) => void }): void { app.get('/users', listUsers); }
`);
		dir = await mkdtemp(join(tmpdir(), 'tkg-endpoint-'));
		store = new KuzuStore(join(dir, 'graph.kuzu'));
		await store.initSchema();
		await store.load(nodes, edges);
	});

	afterEach(async () => {
		await store.close();
		await rm(dir, { recursive: true, force: true });
	});

	it('find locates the Endpoint by name substring and by exact kind', async () => {
		const query = new GraphQuery(store);
		const byName = await query.find('/users');
		assert.ok(byName.some((ref) => ref.id === 'Endpoint:GET /users'));
		const byKind = await query.find('Endpoint');
		assert.deepEqual(byKind.map((ref) => ref.kind), ['Endpoint']);
		assert.equal(byKind[0].id, 'Endpoint:GET /users');
	});

	it('references on the handler reports the endpoint via HANDLES', async () => {
		const query = new GraphQuery(store);
		const handler = (await query.find('listUsers'))[0];
		const incoming = await query.references(handler.id);
		assert.ok(incoming.some((ref) => ref.edgeKind === 'HANDLES' && ref.id === 'Endpoint:GET /users'));
	});
});
