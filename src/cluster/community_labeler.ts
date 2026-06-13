import { WeightedEdge } from './community_detector.js';

/** The subset of a node's fields the labeler reasons over. */
export type LabelableNode = {
	id: string;
	name: string;
	kind: string;
	filePath: string;
};

/** Everything {@link CommunityLabeler.label} needs: the partition, the nodes, and the weighted edges. */
export type CommunityLabelInput = {
	/** Node id to community index, as produced by {@link CommunityDetector.detect}. */
	communityOf: Map<string, number>;
	/** The clustered nodes; only members present in `communityOf` are labelled. */
	nodes: LabelableNode[];
	/** The weighted edges the clustering ran on, used to find each community's hub. */
	edges: WeightedEdge[];
};

/**
 * Fraction of a community's members that must share one directory before that
 * directory is treated as the community's "area". Below this the members are too
 * scattered for the directory to be meaningful, so the label falls back to the hub.
 */
const DIRECTORY_PURITY_THRESHOLD = 0.6;

/**
 * Derives a human-readable label for each community from its members — a
 * deterministic, dependency-free alternative to the bare ordinal (`community 3`).
 *
 * The label is a composite of two signals available on every node:
 * - the **dominant directory** the members share (code communities track module
 *   structure), and
 * - the **hub member** — the node with the highest internal (within-community)
 *   weighted degree, i.e. the symbol the rest of the community couples to most.
 *
 * Because every part is derived from membership (never the ordinal index), the
 * same group of nodes earns the same label across the algorithm's stochastic
 * re-runs. This module is pure — it takes a partition and returns labels, with no
 * store access — mirroring {@link CommunityDetector}.
 */
export class CommunityLabeler {
	/**
	 * Returns a map from community index to a unique, human-readable label.
	 *
	 * Per community: if the members live in a single file, the label is that file's
	 * base name; otherwise it is `<directory> · <hub>` when the members concentrate
	 * in one directory, or the hub alone when they are scattered. Colliding labels
	 * are disambiguated with the hub, then the ordinal, so the result is injective.
	 */
	static label(input: CommunityLabelInput): Map<number, string> {
		const groups = CommunityLabeler.groupMembers(input.communityOf, input.nodes);
		const internalDegree = CommunityLabeler.internalDegree(input.communityOf, input.edges);

		const base = new Map<number, string>();
		const hubs = new Map<number, string | undefined>();
		for (const [index, members] of groups) {
			const hub = CommunityLabeler.hubName(members, internalDegree);
			hubs.set(index, hub);
			base.set(index, CommunityLabeler.composeLabel(index, members, hub));
		}
		return CommunityLabeler.dedupe(base, hubs);
	}

	/** Buckets the labelled nodes by their community index, dropping nodes absent from the partition. */
	private static groupMembers(
		communityOf: Map<string, number>,
		nodes: LabelableNode[],
	): Map<number, LabelableNode[]> {
		const groups = new Map<number, LabelableNode[]>();
		for (const node of nodes) {
			const index = communityOf.get(node.id);
			if (index === undefined) {
				continue;
			}
			const members = groups.get(index) ?? [];
			members.push(node);
			groups.set(index, members);
		}
		return groups;
	}

	/**
	 * Sums each node's weighted degree over edges that stay inside its community.
	 * Cross-community edges and self-loops are ignored, so the result ranks members
	 * by how strongly they couple to the rest of their own community.
	 */
	private static internalDegree(communityOf: Map<string, number>, edges: WeightedEdge[]): Map<string, number> {
		const degree = new Map<string, number>();
		for (const edge of edges) {
			if (edge.from === edge.to) {
				continue;
			}
			const from = communityOf.get(edge.from);
			const to = communityOf.get(edge.to);
			if (from === undefined || to === undefined || from !== to) {
				continue;
			}
			degree.set(edge.from, (degree.get(edge.from) ?? 0) + edge.weight);
			degree.set(edge.to, (degree.get(edge.to) ?? 0) + edge.weight);
		}
		return degree;
	}

	/**
	 * The name of the member with the greatest internal weighted degree, breaking
	 * ties by name then id so the choice is stable. Returns `undefined` only for an
	 * empty group.
	 */
	private static hubName(members: LabelableNode[], internalDegree: Map<string, number>): string | undefined {
		if (members.length === 0) {
			return undefined;
		}
		const ranked = [...members].sort((a, b) => {
			const degreeA = internalDegree.get(a.id) ?? 0;
			const degreeB = internalDegree.get(b.id) ?? 0;
			if (degreeB !== degreeA) {
				return degreeB - degreeA;
			}
			if (a.name !== b.name) {
				return a.name < b.name ? -1 : 1;
			}
			return a.id < b.id ? -1 : 1;
		});
		return CommunityLabeler.displayName(ranked[0]);
	}

	/**
	 * A node's human-facing name. `Module` nodes carry their file path as their
	 * name, which reads poorly as a label, so they display as the file's base name.
	 */
	private static displayName(node: LabelableNode): string {
		return node.kind === 'Module' ? CommunityLabeler.baseName(node.filePath) : node.name;
	}

	/** Builds the un-deduplicated label for one community from its area and hub. */
	private static composeLabel(index: number, members: LabelableNode[], hub: string | undefined): string {
		if (members.length === 0) {
			return `community ${index}`;
		}
		const files = new Set(members.map((member) => member.filePath));
		if (files.size === 1) {
			const fileName = CommunityLabeler.baseName(members[0].filePath);
			return fileName.length > 0 ? fileName : (hub ?? `community ${index}`);
		}
		const { directory, purity } = CommunityLabeler.dominantDirectory(members);
		const area = CommunityLabeler.lastSegment(directory);
		if (area.length > 0 && purity >= DIRECTORY_PURITY_THRESHOLD) {
			return hub === undefined ? area : `${area} · ${hub}`;
		}
		if (hub !== undefined) {
			return hub;
		}
		return area.length > 0 ? area : `community ${index}`;
	}

	/**
	 * The directory most members share, with the fraction of members under it. Ties
	 * favour the shorter (shallower) path, then lexical order, for determinism.
	 */
	private static dominantDirectory(members: LabelableNode[]): { directory: string; purity: number } {
		const counts = new Map<string, number>();
		for (const member of members) {
			const directory = CommunityLabeler.directoryOf(member.filePath);
			counts.set(directory, (counts.get(directory) ?? 0) + 1);
		}
		const ranked = [...counts.entries()].sort((a, b) => {
			if (b[1] !== a[1]) {
				return b[1] - a[1];
			}
			if (a[0].length !== b[0].length) {
				return a[0].length - b[0].length;
			}
			return a[0] < b[0] ? -1 : 1;
		});
		const [directory, count] = ranked[0];
		return { directory, purity: count / members.length };
	}

	/**
	 * Resolves label collisions into a unique set: a duplicated label gains its
	 * community's hub (when that adds information), and any still-colliding label
	 * gains a `#index` suffix as a last resort.
	 */
	private static dedupe(base: Map<number, string>, hubs: Map<number, string | undefined>): Map<number, string> {
		const withHub = CommunityLabeler.disambiguate(base, (index, label) => {
			const hub = hubs.get(index);
			return hub !== undefined && label.includes(hub) === false ? `${label} · ${hub}` : label;
		});
		return CommunityLabeler.disambiguate(withHub, (index, label) => `${label} #${index}`);
	}

	/** Applies `rename` to every label that more than one community currently shares. */
	private static disambiguate(
		labels: Map<number, string>,
		rename: (index: number, label: string) => string,
	): Map<number, string> {
		const counts = new Map<string, number>();
		for (const label of labels.values()) {
			counts.set(label, (counts.get(label) ?? 0) + 1);
		}
		const result = new Map<number, string>();
		for (const [index, label] of labels) {
			result.set(index, (counts.get(label) ?? 0) > 1 ? rename(index, label) : label);
		}
		return result;
	}

	/** The directory portion of a POSIX-style path, or `''` for a bare file name. */
	private static directoryOf(filePath: string): string {
		const slash = filePath.lastIndexOf('/');
		return slash === -1 ? '' : filePath.slice(0, slash);
	}

	/** The final segment of a directory path, or the whole path when it has no separator. */
	private static lastSegment(directory: string): string {
		if (directory.length === 0) {
			return '';
		}
		const slash = directory.lastIndexOf('/');
		return slash === -1 ? directory : directory.slice(slash + 1);
	}

	/** A file's base name without its directory or extension (`src/a/foo.ts` → `foo`). */
	private static baseName(filePath: string): string {
		const slash = filePath.lastIndexOf('/');
		const fileName = slash === -1 ? filePath : filePath.slice(slash + 1);
		const dot = fileName.lastIndexOf('.');
		return dot <= 0 ? fileName : fileName.slice(0, dot);
	}
}
