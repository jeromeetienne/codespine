import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WeightedEdge } from '../src/cluster/community_detector.js';
import { CommunityLabeler, LabelableNode } from '../src/cluster/community_labeler.js';

function node(id: string, name: string, filePath: string, kind = 'Function'): LabelableNode {
	return { id, name, filePath, kind };
}

describe('CommunityLabeler', () => {
	it('labels a single-file community by its file base name', () => {
		const nodes = [
			node('a', 'open', 'src/store/kuzu_store.ts'),
			node('b', 'close', 'src/store/kuzu_store.ts'),
			node('c', 'run', 'src/store/kuzu_store.ts'),
		];
		const edges: WeightedEdge[] = [
			{ from: 'a', to: 'b', weight: 3 },
			{ from: 'b', to: 'c', weight: 3 },
		];
		const communityOf = new Map([['a', 0], ['b', 0], ['c', 0]]);

		const labels = CommunityLabeler.label({ communityOf, nodes, edges });

		assert.equal(labels.get(0), 'kuzu_store');
	});

	it('labels a single-directory community as "<directory> · <hub>"', () => {
		const nodes = [
			node('det', 'CommunityDetector', 'src/cluster/community_detector.ts', 'Class'),
			node('clu', 'GraphClusterer', 'src/cluster/graph_clusterer.ts', 'Class'),
			node('wts', 'ClusterWeights', 'src/cluster/cluster_weights.ts', 'Class'),
		];
		const edges: WeightedEdge[] = [
			{ from: 'det', to: 'clu', weight: 3 },
			{ from: 'det', to: 'wts', weight: 3 },
			{ from: 'clu', to: 'wts', weight: 1 },
		];
		const communityOf = new Map([['det', 0], ['clu', 0], ['wts', 0]]);

		const labels = CommunityLabeler.label({ communityOf, nodes, edges });

		assert.equal(labels.get(0), 'cluster · CommunityDetector');
	});

	it('falls back to the hub alone when members are scattered across directories', () => {
		const nodes = [
			node('alpha', 'Alpha', 'src/a/one.ts'),
			node('beta', 'Beta', 'src/b/two.ts'),
			node('gamma', 'Gamma', 'src/c/three.ts'),
			node('delta', 'Delta', 'src/d/four.ts'),
		];
		const edges: WeightedEdge[] = [
			{ from: 'alpha', to: 'beta', weight: 3 },
			{ from: 'alpha', to: 'gamma', weight: 3 },
			{ from: 'alpha', to: 'delta', weight: 3 },
		];
		const communityOf = new Map([['alpha', 0], ['beta', 0], ['gamma', 0], ['delta', 0]]);

		const labels = CommunityLabeler.label({ communityOf, nodes, edges });

		assert.equal(labels.get(0), 'Alpha');
	});

	it('picks the hub by internal weighted degree, ignoring cross-community edges', () => {
		const nodes = [
			node('hub', 'Hub', 'src/x/hub.ts'),
			node('leaf1', 'Leaf1', 'src/x/leaf1.ts'),
			node('leaf2', 'Leaf2', 'src/x/leaf2.ts'),
			node('outsider', 'Outsider', 'src/y/out.ts'),
		];
		const edges: WeightedEdge[] = [
			{ from: 'hub', to: 'leaf1', weight: 5 },
			{ from: 'hub', to: 'leaf2', weight: 5 },
			// A heavy cross-community edge must not promote 'leaf1' to hub.
			{ from: 'leaf1', to: 'outsider', weight: 100 },
		];
		const communityOf = new Map([['hub', 0], ['leaf1', 0], ['leaf2', 0], ['outsider', 1]]);

		const labels = CommunityLabeler.label({ communityOf, nodes, edges });

		assert.equal(labels.get(0), 'x · Hub');
	});

	it('disambiguates colliding labels with the hub', () => {
		const nodes = [
			node('foo', 'Foo', 'src/a/index.ts'),
			node('bar', 'Bar', 'src/b/index.ts'),
		];
		const communityOf = new Map([['foo', 0], ['bar', 1]]);

		const labels = CommunityLabeler.label({ communityOf, nodes, edges: [] });

		assert.equal(labels.get(0), 'index · Foo');
		assert.equal(labels.get(1), 'index · Bar');
	});

	it('labels by membership, independent of the community index', () => {
		const nodes = [
			node('p', 'Parser', 'src/lang/parser.ts'),
			node('q', 'Lexer', 'src/lang/lexer.ts'),
		];
		const edges: WeightedEdge[] = [{ from: 'p', to: 'q', weight: 3 }];

		const atZero = CommunityLabeler.label({ communityOf: new Map([['p', 0], ['q', 0]]), nodes, edges });
		const atSeven = CommunityLabeler.label({ communityOf: new Map([['p', 7], ['q', 7]]), nodes, edges });

		assert.equal(atZero.get(0), atSeven.get(7));
	});

	it('displays a Module-node hub as its file base name, not its path', () => {
		const nodes = [
			// A lone module-scope community and a stray method from the same file both
			// reduce to the base name 'array_utils' and must be disambiguated cleanly.
			node('mod', 'src/utils/array_utils.ts', 'src/utils/array_utils.ts', 'Module'),
			node('chunk', 'chunk', 'src/utils/array_utils.ts', 'Method'),
		];
		const communityOf = new Map([['mod', 0], ['chunk', 1]]);

		const labels = CommunityLabeler.label({ communityOf, nodes, edges: [] });

		assert.equal(labels.get(0), 'array_utils');
		assert.equal(labels.get(1), 'array_utils · chunk');
	});

	it('ignores nodes absent from the partition', () => {
		const nodes = [node('a', 'A', 'src/m/a.ts'), node('ghost', 'Ghost', 'src/m/ghost.ts')];

		const labels = CommunityLabeler.label({ communityOf: new Map([['a', 0]]), nodes, edges: [] });

		assert.equal(labels.size, 1);
		assert.equal(labels.has(0), true);
	});
});
