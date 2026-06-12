import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Project } from 'ts-morph';
import { GraphBuilder } from '../src/extract/graph_builder.js';
import { GraphEdge } from '../src/schema/edge.js';

const MODULE_ID = 'Module:src/a.ts';

function buildEdges(source: string, semantic = false): GraphEdge[] {
	const project = new Project({ useInMemoryFileSystem: true });
	project.createSourceFile('src/a.ts', source);
	const builder = new GraphBuilder();
	builder.build(project, '/', { semantic });
	return builder.getEdges();
}

describe('EXPORTS edge emission', () => {
	it('emits an EXPORTS edge from the module to each exported top-level declaration', () => {
		const edges = buildEdges(`
export function shown(): void {}
export const value = 1;
export class Widget {}
export interface Shape {}
export type Id = string;
export enum Color { Red }
`);
		const exports = edges.filter((edge) => edge.kind === 'EXPORTS');
		assert.ok(exports.every((edge) => edge.from === MODULE_ID));
		const targets = exports.map((edge) => edge.to);
		for (const marker of ['#shown@', '#value@', '#Widget@', '#Shape@', '#Id@', '#Color@']) {
			assert.ok(targets.some((id) => id.includes(marker)), `missing EXPORTS for ${marker}`);
		}
	});

	it('does not emit EXPORTS for non-exported declarations', () => {
		const edges = buildEdges(`
function hidden(): void {}
const secret = 1;
class Internal {}
`);
		assert.equal(edges.filter((edge) => edge.kind === 'EXPORTS').length, 0);
	});

	it('does not emit EXPORTS for class or interface members', () => {
		const edges = buildEdges(`
export class Widget { render(): void {} count = 0; }
`);
		const exports = edges.filter((edge) => edge.kind === 'EXPORTS');
		assert.equal(exports.length, 1);
		assert.ok(exports[0].to.includes('#Widget@'));
	});

	it('is emitted by the structural layer alone, without --semantic', () => {
		const edges = buildEdges('export const value = 1;', false);
		const exports = edges.filter((edge) => edge.kind === 'EXPORTS');
		assert.equal(exports.length, 1);
		assert.equal(exports[0].from, MODULE_ID);
		assert.ok(exports[0].to.includes('#value@'));
	});
});
