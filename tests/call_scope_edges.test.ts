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

function buildGraph(source: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const project = new Project({ useInMemoryFileSystem: true });
	project.createSourceFile('src/a.ts', source);
	const builder = new GraphBuilder();
	builder.build(project, '/', { semantic: true });
	return { nodes: builder.getNodes(), edges: builder.getEdges() };
}

function callsBetween(edges: GraphEdge[], fromMarker: string, toMarker: string): GraphEdge[] {
	return edges.filter((edge) =>
		edge.kind === 'CALLS' && edge.from.includes(fromMarker) && edge.to.includes(toMarker));
}

describe('CALLS / INSTANTIATES attribution for arrow and function-expression scopes (#152)', () => {
	it('records a call made inside a module-scope arrow function', () => {
		const { edges } = buildGraph(`
export function target(): number { return 1; }
export const caller = (): number => target();
`);
		assert.equal(callsBetween(edges, '#caller@', '#target@').length, 1);
	});

	it('attributes a call inside a bare callback argument to the module', () => {
		const { edges } = buildGraph(`
export function seed(): void {}
function test(name: string, fn: () => void): void {}
test('logs in', () => { seed(); });
`);
		const toSeed = callsBetween(edges, 'Module:', '#seed@');
		assert.equal(toSeed.length, 1);
		assert.ok(toSeed[0].from.startsWith('Module:'));
	});

	it('records a `new` expression inside an arrow function', () => {
		const { edges } = buildGraph(`
export class Widget {}
export const make = () => new Widget();
`);
		const instantiates = edges.filter((edge) =>
			edge.kind === 'INSTANTIATES' && edge.from.includes('#make@') && edge.to.includes('#Widget@'));
		assert.equal(instantiates.length, 1);
	});

	it('still attributes a call inside a class method to the method', () => {
		const { edges } = buildGraph(`
export function helper(): void {}
export class C { run(): void { helper(); } }
`);
		assert.equal(callsBetween(edges, '#run@', '#helper@').length, 1);
	});

	it('still attributes a call inside a module-scope function to the function', () => {
		const { edges } = buildGraph(`
export function callee(): void {}
export function caller(): void { callee(); }
`);
		assert.equal(callsBetween(edges, '#caller@', '#callee@').length, 1);
	});
});

describe('dead-exports no longer flags arrow-called functions (#152)', () => {
	let dir: string;
	let store: KuzuStore;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'tkg-deadexports-'));
		store = new KuzuStore(join(dir, 'graph.kuzu'));
		await store.initSchema();
	});

	afterEach(async () => {
		await store.close();
		await rm(dir, { recursive: true, force: true });
	});

	it('does not report a function called only from an arrow function as dead', async () => {
		const { nodes, edges } = buildGraph(`
export function calledFromArrow(): number { return 1; }
export const caller = (): number => calledFromArrow();
`);
		await store.load(nodes, edges);
		const dead = await new GraphQuery(store).deadExports();
		const names = dead.map((ref) => ref.name);
		assert.equal(names.includes('calledFromArrow'), false);
	});
});
