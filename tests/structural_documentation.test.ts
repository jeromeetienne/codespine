import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Project } from 'ts-morph';
import { GraphBuilder } from '../src/extract/graph_builder.js';
import { GraphNode } from '../src/schema/node.js';

function buildNodes(source: string): GraphNode[] {
	const project = new Project({ useInMemoryFileSystem: true });
	project.createSourceFile('src/a.ts', source);
	const builder = new GraphBuilder();
	builder.build(project, '/', { semantic: false });
	return builder.getNodes();
}

const docOf = (nodes: GraphNode[], name: string): unknown =>
	nodes.find((node) => node.name === name)?.metadata?.documentation;

describe('JSDoc documentation extraction', () => {
	it('attaches a function JSDoc summary to metadata.documentation', () => {
		const nodes = buildNodes('/** Adds two numbers. */\nexport function add(a: number, b: number): number { return a + b; }');
		assert.equal(docOf(nodes, 'add'), 'Adds two numbers.');
	});

	it('documents classes and their methods', () => {
		const nodes = buildNodes(`
/** A small calculator. */
export class Calc {
	/** Resets the accumulator to zero. */
	reset(): void {}
}
`);
		assert.equal(docOf(nodes, 'Calc'), 'A small calculator.');
		assert.equal(docOf(nodes, 'reset'), 'Resets the accumulator to zero.');
	});

	it('reads a variable doc comment from the enclosing statement', () => {
		const nodes = buildNodes('/** The default port. */\nexport const PORT = 8080;');
		assert.equal(docOf(nodes, 'PORT'), 'The default port.');
	});

	it('leaves an undocumented declaration without a metadata field', () => {
		const nodes = buildNodes('export function bare(): void {}');
		const node = nodes.find((candidate) => candidate.name === 'bare');
		assert.equal(node?.metadata, undefined);
	});

	it('ignores a comment that carries only tags', () => {
		const nodes = buildNodes('/**\n * @param a the addend\n */\nexport function tagsOnly(a: number): number { return a; }');
		assert.equal(docOf(nodes, 'tagsOnly'), undefined);
	});

	it('keeps only the first paragraph and collapses wrapped lines', () => {
		const nodes = buildNodes(`
/**
 * Parses the input
 * across two lines.
 *
 * This second paragraph is dropped.
 */
export function parse(): void {}
`);
		assert.equal(docOf(nodes, 'parse'), 'Parses the input across two lines.');
	});

	it('resolves inline {@link} tags to their display text', () => {
		const bare = buildNodes('/** Wraps {@link Document} values. */\nexport function a(): void {}');
		assert.equal(docOf(bare, 'a'), 'Wraps Document values.');
		const piped = buildNodes('/** See {@link Document | the document} for details. */\nexport function b(): void {}');
		assert.equal(docOf(piped, 'b'), 'See the document for details.');
	});

	it('truncates an over-long summary with an ellipsis', () => {
		const long = 'word '.repeat(200).trim();
		const nodes = buildNodes(`/** ${long} */\nexport function big(): void {}`);
		const doc = docOf(nodes, 'big');
		assert.equal(typeof doc, 'string');
		assert.ok(typeof doc === 'string' && doc.length <= 400);
		assert.ok(typeof doc === 'string' && doc.endsWith('…'));
	});
});
