import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AssignedNode, CommunityNamer } from '../src/cluster/community_namer.js';

function assigned(
	id: string,
	name: string,
	filePath: string,
	community: number | undefined,
	currentLabel?: string,
	kind = 'Function',
): AssignedNode {
	return { id, name, kind, filePath, community, currentLabel };
}

describe('CommunityNamer.summarize', () => {
	it('groups assigned nodes by community, largest first, dropping unassigned nodes', () => {
		const nodes = [
			assigned('a', 'open', 'src/store/kuzu_store.ts', 0, 'kuzu_store'),
			assigned('b', 'close', 'src/store/kuzu_store.ts', 0, 'kuzu_store'),
			assigned('c', 'Detector', 'src/cluster/community_detector.ts', 1, 'cluster · Detector', 'Class'),
			assigned('loose', 'Helper', 'src/util/helper.ts', undefined),
		];

		const dump = CommunityNamer.summarize(nodes);

		assert.equal(dump.communityCount, 2);
		assert.equal(dump.communities[0].index, 0);
		assert.equal(dump.communities[0].size, 2);
		assert.equal(dump.communities[0].currentLabel, 'kuzu_store');
		assert.equal(dump.communities[1].index, 1);
		assert.equal(dump.communities[1].size, 1);
	});

	it('orders members deterministically by file then name', () => {
		const nodes = [
			assigned('a', 'open', 'src/store/kuzu_store.ts', 0, 'kuzu_store'),
			assigned('b', 'close', 'src/store/kuzu_store.ts', 0, 'kuzu_store'),
		];

		const dump = CommunityNamer.summarize(nodes);

		assert.deepEqual(dump.communities[0].members.map((member) => member.name), ['close', 'open']);
	});

	it('falls back to the ordinal label when no member carries one', () => {
		const dump = CommunityNamer.summarize([assigned('a', 'A', 'src/a.ts', 3)]);

		assert.equal(dump.communities[0].currentLabel, 'community 3');
	});

	it('reports no communities when nothing is clustered', () => {
		const dump = CommunityNamer.summarize([assigned('x', 'X', 'src/x.ts', undefined)]);

		assert.equal(dump.communityCount, 0);
		assert.deepEqual(dump.communities, []);
	});
});

describe('CommunityNamer.plan', () => {
	it('emits a change per renamed community, skips no-ops, and flags unknown indexes', () => {
		const nodes = [
			assigned('a', 'open', 'src/store/kuzu_store.ts', 0, 'kuzu_store'),
			assigned('b', 'close', 'src/store/kuzu_store.ts', 0, 'kuzu_store'),
			assigned('c', 'Detector', 'src/cluster/community_detector.ts', 1, 'cluster · Detector', 'Class'),
		];
		const labels = new Map([[0, 'Graph persistence'], [1, 'cluster · Detector'], [2, 'Ghost']]);

		const plan = CommunityNamer.plan(nodes, labels);

		assert.equal(plan.changes.length, 1);
		assert.equal(plan.changes[0].index, 0);
		assert.equal(plan.changes[0].from, 'kuzu_store');
		assert.equal(plan.changes[0].to, 'Graph persistence');
		assert.deepEqual([...plan.changes[0].nodeIds].sort(), ['a', 'b']);
		assert.deepEqual(plan.unknownIndexes, [2]);
	});

	it('orders changes by community index regardless of request order', () => {
		const nodes = [
			assigned('a', 'A', 'src/a.ts', 2, 'two'),
			assigned('b', 'B', 'src/b.ts', 0, 'zero'),
			assigned('c', 'C', 'src/c.ts', 1, 'one'),
		];
		const labels = new Map([[2, 'Two!'], [0, 'Zero!'], [1, 'One!']]);

		const plan = CommunityNamer.plan(nodes, labels);

		assert.deepEqual(plan.changes.map((change) => change.index), [0, 1, 2]);
	});
});

describe('CommunityNamer.updateManifestLabels', () => {
	it('updates the labels array at the renamed indexes and preserves other fields', () => {
		const manifest = { algorithm: 'leiden-cpm', communityCount: 3, labels: ['zero', 'one', 'two'] };

		const updated = CommunityNamer.updateManifestLabels(manifest, new Map([[0, 'Zero!'], [2, 'Two!'], [5, 'OOB']]));

		assert.deepEqual(updated?.labels, ['Zero!', 'one', 'Two!']);
		assert.equal(updated?.algorithm, 'leiden-cpm');
		assert.deepEqual(manifest.labels, ['zero', 'one', 'two']);
	});

	it('returns null for an absent manifest', () => {
		assert.equal(CommunityNamer.updateManifestLabels(null, new Map([[0, 'x']])), null);
	});

	it('leaves a manifest without a labels array unchanged', () => {
		const updated = CommunityNamer.updateManifestLabels({ algorithm: 'leiden-cpm' }, new Map([[0, 'x']]));

		assert.deepEqual(updated, { algorithm: 'leiden-cpm' });
	});
});
