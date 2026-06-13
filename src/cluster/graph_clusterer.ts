import type { KuzuValue } from 'kuzu';
import { EDGE_KINDS, EdgeKind } from '../schema/edge.js';
import { KuzuStore } from '../store/kuzu_store.js';
import { CommunityDetector, CommunityOptions, DEFAULT_COMMUNITY_OPTIONS, WeightedEdge } from './community_detector.js';
import { CommunityLabeler } from './community_labeler.js';

/** Namespaced key under which a node's community index is stored on its metadata. */
export const COMMUNITY_METADATA_KEY = 'community';

/** Namespaced key under which a node's human-readable community label is stored on its metadata. */
export const COMMUNITY_LABEL_METADATA_KEY = 'communityLabel';

/** Graph-level metadata key under which the clustering manifest is recorded. */
export const CLUSTERING_MANIFEST_KEY = 'clustering';

/** The runtime call-graph edge kind (`enrich`); its weight comes from sample count, not call-site count. */
const RUNTIME_CALL_EDGE_KIND: EdgeKind = 'CALLS_RUNTIME';

/** The summary `cluster` returns and prints. */
export type ClusterReport = {
	nodesAssigned: number;
	communityCount: number;
	quality: number;
	resolution: number;
	/** Member count per community, descending. */
	sizes: number[];
	/** Human-readable label per community, aligned with {@link ClusterReport.sizes}. */
	labels: string[];
};

/**
 * Orchestrates a clustering pass over a loaded graph: read the weighted edges,
 * detect communities with {@link CommunityDetector}, and attach the community
 * index onto each node's metadata. Mirrors {@link RuntimeEnricher} — the pure
 * algorithm lives in {@link CommunityDetector}; this class owns the store I/O.
 *
 * Existing node metadata is preserved; only the `community` key is written, so
 * re-running is idempotent for an unchanged graph.
 */
export class GraphClusterer {
	static async cluster(
		store: KuzuStore,
		weights: Partial<Record<EdgeKind, number>> = {},
		options: CommunityOptions = DEFAULT_COMMUNITY_OPTIONS,
	): Promise<ClusterReport> {
		const edges = await GraphClusterer.readWeightedEdges(store, weights);
		const result = CommunityDetector.detect(edges, options);

		const nodes = await store.readNodes();
		const labels = CommunityLabeler.label({
			communityOf: result.communityOf,
			nodes: nodes.map((node) => ({ id: node.id, name: node.name, kind: node.kind, filePath: node.filePath })),
			edges,
		});

		const updates: { id: string; metadata: Record<string, unknown> }[] = [];
		for (const node of nodes) {
			const index = result.communityOf.get(node.id);
			if (index === undefined) {
				continue;
			}
			updates.push({
				id: node.id,
				metadata: {
					...node.metadata,
					[COMMUNITY_METADATA_KEY]: index,
					[COMMUNITY_LABEL_METADATA_KEY]: labels.get(index) ?? `community ${index}`,
				},
			});
		}
		await store.writeNodeMetadata(updates);

		const orderedLabels = GraphClusterer.orderLabels(labels, result.communityCount);

		await store.writeGraphMeta(CLUSTERING_MANIFEST_KEY, {
			algorithm: 'leiden-cpm',
			resolution: options.resolution,
			communityCount: result.communityCount,
			quality: result.quality,
			labels: orderedLabels,
		});

		return {
			nodesAssigned: updates.length,
			communityCount: result.communityCount,
			quality: result.quality,
			resolution: options.resolution,
			sizes: result.sizes,
			labels: orderedLabels,
		};
	}

	/** Flattens the per-index label map into an array aligned with community indices `0..count-1`. */
	private static orderLabels(labels: Map<number, string>, count: number): string[] {
		return Array.from({ length: count }, (_, index) => labels.get(index) ?? `community ${index}`);
	}

	/**
	 * Reads every edge whose kind carries a positive weight, resolving each to a
	 * {@link WeightedEdge} whose weight is the kind's coefficient times the edge's
	 * call-site `count`.
	 */
	private static async readWeightedEdges(
		store: KuzuStore,
		weights: Partial<Record<EdgeKind, number>>,
	): Promise<WeightedEdge[]> {
		const kinds = EDGE_KINDS.filter((kind) => (weights[kind] ?? 0) > 0);
		if (kinds.length === 0) {
			return [];
		}
		const kindList = `[${kinds.map((kind) => `'${kind}'`).join(', ')}]`;
		const rows = await store.run(
			`MATCH (source:GraphNode)-[e:Edge]->(target:GraphNode)
			WHERE e.kind IN ${kindList}
			RETURN source.id AS fromId, target.id AS toId, e.kind AS kind, e.metadata AS metadata`,
		);

		// Runtime call edges carry a sample count that dwarfs static call-site counts;
		// normalize them by the hottest runtime edge so the runtime coefficient stays
		// on the same scale as the static ones — the peak call path contributes its
		// full coefficient, cooler paths proportionally less.
		const maxRuntimeSamples = rows.reduce(
			(max, row) => String(row.kind) === RUNTIME_CALL_EDGE_KIND
				? Math.max(max, GraphClusterer.edgeSamples(row.metadata))
				: max,
			0,
		);

		return rows.map((row) => {
			const kind = String(row.kind) as EdgeKind;
			const coefficient = weights[kind] ?? 0;
			const strength = kind === RUNTIME_CALL_EDGE_KIND
				? (maxRuntimeSamples > 0 ? GraphClusterer.edgeSamples(row.metadata) / maxRuntimeSamples : 0)
				: GraphClusterer.callCount(row.metadata);
			return {
				from: String(row.fromId),
				to: String(row.toId),
				weight: coefficient * strength,
			};
		});
	}

	/** Decodes an edge's call-site `count`, defaulting to 1 (the minimum the builder records). */
	private static callCount(value: KuzuValue): number {
		const count = GraphClusterer.parseMetadata(value).count;
		return typeof count === 'number' && count > 0 ? count : 1;
	}

	/** Decodes a runtime call edge's `samples` weight, defaulting to 0. */
	private static edgeSamples(value: KuzuValue): number {
		const samples = GraphClusterer.parseMetadata(value).samples;
		return typeof samples === 'number' && samples > 0 ? samples : 0;
	}

	/** Decodes the JSON `metadata` column into a record; a missing, empty, or malformed value yields an empty record. */
	private static parseMetadata(value: KuzuValue): Record<string, unknown> {
		if (typeof value !== 'string' || value.length === 0) {
			return {};
		}
		try {
			const parsed: unknown = JSON.parse(value);
			return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
		} catch {
			return {};
		}
	}
}
