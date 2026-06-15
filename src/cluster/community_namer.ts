/** A node already assigned to a community, reduced to the fields the namer reasons over. */
export type AssignedNode = {
	id: string;
	name: string;
	kind: string;
	filePath: string;
	/** The node's community index, or `undefined` when it was never clustered. */
	community: number | undefined;
	/** The node's current community label, or `undefined` when none was written. */
	currentLabel: string | undefined;
};

/** One member of a community as it appears in a naming dump. */
export type CommunityMember = {
	name: string;
	kind: string;
	filePath: string;
};

/** One community in a naming dump: its index, current label, size, and members. */
export type CommunitySummary = {
	index: number;
	currentLabel: string;
	size: number;
	members: CommunityMember[];
};

/** The read-only payload `cluster communities` emits for an agent to name. */
export type CommunitiesDump = {
	communityCount: number;
	communities: CommunitySummary[];
};

/** One community's rename: the index, the label it moves from and to, and the members to relabel. */
export type RenameChange = {
	index: number;
	from: string;
	to: string;
	nodeIds: string[];
};

/** The outcome of resolving a rename request against the current assignment. */
export type RenamePlan = {
	/** Communities whose label actually changes; a no-op (same label) is omitted. */
	changes: RenameChange[];
	/** Requested indices that match no clustered community, so the caller can warn. */
	unknownIndexes: number[];
};

/**
 * Turns a clustered graph's community assignment into a human-namable dump and,
 * conversely, resolves a `{ index → label }` request into the relabelling work.
 *
 * This is the data half of the "let Claude Code rename the communities" flow: it
 * never calls a model and never touches the store. The command layer reads the
 * nodes, hands them here as {@link AssignedNode}s, ships {@link CommunitiesDump}
 * out for naming, and applies the {@link RenamePlan} that comes back. Pure and
 * dependency-free, mirroring {@link CommunityLabeler} and {@link CommunityDetector}.
 */
export class CommunityNamer {
	/**
	 * Groups the assigned nodes by community index into a dump sorted by descending
	 * size (ties broken by index), so the largest, most worth-naming communities lead.
	 * Nodes without a community index are ignored.
	 */
	static summarize(nodes: AssignedNode[]): CommunitiesDump {
		const groups = CommunityNamer.group(nodes);
		const communities: CommunitySummary[] = [];
		for (const [index, members] of groups) {
			communities.push({
				index,
				currentLabel: CommunityNamer.currentLabelOf(index, members),
				size: members.length,
				members: CommunityNamer.sortMembers(members).map((member) => ({
					name: member.name,
					kind: member.kind,
					filePath: member.filePath,
				})),
			});
		}
		communities.sort((a, b) => (b.size !== a.size ? b.size - a.size : a.index - b.index));
		return { communityCount: groups.size, communities };
	}

	/**
	 * Resolves a `{ index → label }` request into the set of communities whose label
	 * actually changes. A request for an index that matches no community is collected
	 * into `unknownIndexes`; a request that repeats the current label is dropped as a
	 * no-op. Changes are ordered by index so the applied summary reads stably.
	 */
	static plan(nodes: AssignedNode[], labels: Map<number, string>): RenamePlan {
		const groups = CommunityNamer.group(nodes);
		const changes: RenameChange[] = [];
		const unknownIndexes: number[] = [];
		for (const index of [...labels.keys()].sort((a, b) => a - b)) {
			const members = groups.get(index);
			if (members === undefined) {
				unknownIndexes.push(index);
				continue;
			}
			const to = labels.get(index) ?? '';
			const from = CommunityNamer.currentLabelOf(index, members);
			if (from === to) {
				continue;
			}
			changes.push({ index, from, to, nodeIds: members.map((member) => member.id) });
		}
		return { changes, unknownIndexes };
	}

	/**
	 * Returns a copy of the clustering manifest with its `labels` array updated at the
	 * renamed indices, or `null` when there is no manifest to update. A manifest
	 * without a `labels` array is returned unchanged, and out-of-range indices are
	 * ignored, so the write stays safe against an older or malformed manifest.
	 */
	static updateManifestLabels(
		manifest: Record<string, unknown> | null,
		labels: Map<number, string>,
	): Record<string, unknown> | null {
		if (manifest === null) {
			return null;
		}
		const updated = { ...manifest };
		if (Array.isArray(updated.labels) === false) {
			return updated;
		}
		const labelArray = [...(updated.labels as unknown[])];
		for (const [index, label] of labels) {
			if (index >= 0 && index < labelArray.length) {
				labelArray[index] = label;
			}
		}
		updated.labels = labelArray;
		return updated;
	}

	/** Buckets the clustered nodes by community index, dropping any node without one. */
	private static group(nodes: AssignedNode[]): Map<number, AssignedNode[]> {
		const groups = new Map<number, AssignedNode[]>();
		for (const node of nodes) {
			if (node.community === undefined) {
				continue;
			}
			const members = groups.get(node.community) ?? [];
			members.push(node);
			groups.set(node.community, members);
		}
		return groups;
	}

	/** The community's current label: the first member that carries one, else the bare ordinal. */
	private static currentLabelOf(index: number, members: AssignedNode[]): string {
		for (const member of members) {
			if (member.currentLabel !== undefined && member.currentLabel.length > 0) {
				return member.currentLabel;
			}
		}
		return `community ${index}`;
	}

	/** Orders members by file then name then kind so the dump is deterministic across runs. */
	private static sortMembers(members: AssignedNode[]): AssignedNode[] {
		return [...members].sort((a, b) => {
			if (a.filePath !== b.filePath) {
				return a.filePath < b.filePath ? -1 : 1;
			}
			if (a.name !== b.name) {
				return a.name < b.name ? -1 : 1;
			}
			return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
		});
	}
}
