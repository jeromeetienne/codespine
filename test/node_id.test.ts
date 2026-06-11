import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeId } from '../src/extract/node_id.js';

describe('NodeId', () => {
	it('builds a module id relative to the root path', () => {
		assert.equal(NodeId.forModule('/repo/src/a.ts', '/repo'), 'Module:src/a.ts');
	});

	it('builds a module id for a nested file', () => {
		assert.equal(NodeId.forModule('/repo/src/extract/node_id.ts', '/repo'), 'Module:src/extract/node_id.ts');
	});

	it('builds an external module id from a bare specifier', () => {
		assert.equal(NodeId.forExternalModule('react'), 'External:react');
	});

	it('preserves scoped package specifiers verbatim', () => {
		assert.equal(NodeId.forExternalModule('@atproto/api'), 'External:@atproto/api');
	});
});
