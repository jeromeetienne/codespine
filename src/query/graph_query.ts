import type { KuzuValue } from 'kuzu';
import { KuzuStore, StoredNode } from '../store/kuzu_store.js';

export type SymbolRef = {
	id: string;
	kind: string;
	name: string;
	filePath: string;
	startLine: number;
	metadata: Record<string, unknown>;
};

export type NeighborRef = SymbolRef & {
	edgeKind: string;
	edgeMetadata: Record<string, unknown>;
	direction: 'in' | 'out';
};

/**
 * The metric a {@link GraphQuery.hotspots} ranking is computed against.
 *
 * - `self-time` / `samples` — measured runtime from `metadata.runtime`, present
 *   only after `enrich`.
 * - `callers` — inbound `CALLS` edge count (static fan-in / centrality).
 * - `call-count` — sum of inbound `CALLS` edge `metadata.count` (how often a
 *   symbol is actually invoked across all call sites in source).
 * - `blast-radius` — transitive inbound `CALLS` size (change-risk / centrality).
 */
export type HotspotMetric = 'self-time' | 'samples' | 'callers' | 'call-count' | 'blast-radius';

/** A ranked node, carrying the score it earned and the metric it was scored by. */
export type HotspotRef = SymbolRef & {
	score: number;
	metric: HotspotMetric;
};

export type HotspotOptions = {
	/** Metric to rank by. Defaults to `self-time` when the graph is enriched, `callers` otherwise. */
	by?: HotspotMetric;
	/** Maximum number of hotspots to return. Defaults to 20, clamped to [1, 1000]. */
	limit?: number;
	/** Restrict ranking to nodes that carry `metadata.runtime`. */
	measuredOnly?: boolean;
};

/**
 * The result of a hotspot ranking: the top-N nodes plus the context needed to
 * interpret them — the metric actually used, what was requested, and whether a
 * runtime metric fell back to a static one because the graph is un-enriched.
 */
export type HotspotReport = {
	/** The metric actually used to rank (differs from `requested` only after a fallback). */
	metric: HotspotMetric;
	/** The metric the caller asked for, or the resolved default when none was given. */
	requested: HotspotMetric;
	/** Whether any node in the graph carries `metadata.runtime`. */
	enriched: boolean;
	/** True when a runtime metric was requested on an un-enriched graph, so `metric` fell back to `callers`. */
	fellBack: boolean;
	/** Whether ranking was restricted to measured nodes. */
	measuredOnly: boolean;
	/** Top-N nodes by `metric`, descending, each carrying its `score`. */
	hotspots: HotspotRef[];
};

/** One inbound `CALLS` edge reduced to the fields the ranking needs. */
type CallEdge = {
	fromId: string;
	toId: string;
	count: number;
};

const REFERENCE_EDGE_KINDS = "['CALLS', 'IMPLEMENTS', 'EXTENDS', 'USES_TYPE', 'RETURNS', 'PARAM_TYPE', 'INSTANTIATES', 'READS', 'OVERRIDES']";

const RETURN_REF = (variable: string): string =>
	`${variable}.id AS id, ${variable}.kind AS kind, ${variable}.name AS name, ${variable}.filePath AS filePath, ${variable}.startLine AS startLine, ${variable}.metadata AS metadata`;

/**
 * Kùzu's hard ceiling on the upper bound of a variable-length relationship: a
 * pattern like `-[e:Edge*1..N]-` with `N > 30` is rejected by the binder at query
 * time. {@link GraphQuery.clampDepth} caps `--depth` here so the bound it
 * interpolates into {@link GraphQuery.blastRadius} is always one Kùzu accepts.
 */
const KUZU_MAX_REL_BOUND = 30;

export class GraphQuery {
	private readonly store: KuzuStore;

	constructor(store: KuzuStore) {
		this.store = store;
	}

	async whoCalls(id: string): Promise<SymbolRef[]> {
		const rows = await this.store.run(
			`MATCH (caller:GraphNode)-[e:Edge]->(callee:GraphNode {id: $id})
			WHERE e.kind = 'CALLS'
			RETURN ${RETURN_REF('caller')}
			ORDER BY filePath, startLine`,
			{ id },
		);
		return GraphQuery.toRefs(rows);
	}

	async calls(id: string): Promise<SymbolRef[]> {
		const rows = await this.store.run(
			`MATCH (caller:GraphNode {id: $id})-[e:Edge]->(callee:GraphNode)
			WHERE e.kind = 'CALLS'
			RETURN ${RETURN_REF('callee')}
			ORDER BY filePath, startLine`,
			{ id },
		);
		return GraphQuery.toRefs(rows);
	}

	async blastRadius(id: string, depth: number): Promise<SymbolRef[]> {
		const bound = GraphQuery.clampDepth(depth);
		const rows = await this.store.run(
			`MATCH (target:GraphNode {id: $id})<-[e:Edge*1..${bound} (r, n | WHERE r.kind = 'CALLS')]-(impacted:GraphNode)
			RETURN DISTINCT ${RETURN_REF('impacted')}
			ORDER BY filePath, startLine`,
			{ id },
		);
		return GraphQuery.toRefs(rows);
	}

	async deadExports(): Promise<SymbolRef[]> {
		const rows = await this.store.run(
			`MATCH (n:GraphNode)
			WHERE n.exported = true
			OPTIONAL MATCH (n)<-[selfRef:Edge]-(:GraphNode)
			WHERE selfRef.kind IN ${REFERENCE_EDGE_KINDS}
			WITH n, count(selfRef) AS selfRefs
			OPTIONAL MATCH (n)-[c:Edge]->(member:GraphNode)<-[memberRef:Edge]-(:GraphNode)
			WHERE c.kind = 'CONTAINS' AND memberRef.kind IN ${REFERENCE_EDGE_KINDS}
			WITH n, selfRefs, count(memberRef) AS memberRefs
			WHERE selfRefs = 0 AND memberRefs = 0
			RETURN ${RETURN_REF('n')}
			ORDER BY filePath, startLine`,
		);
		return GraphQuery.toRefs(rows);
	}

	async references(id: string): Promise<NeighborRef[]> {
		const rows = await this.store.run(
			`MATCH (n:GraphNode {id: $id})<-[e:Edge]-(other:GraphNode)
			WHERE e.kind IN ${REFERENCE_EDGE_KINDS}
			RETURN ${RETURN_REF('other')}, e.kind AS edgeKind, e.metadata AS edgeMetadata
			ORDER BY edgeKind, filePath, startLine`,
			{ id },
		);
		return rows.map((row) => GraphQuery.toNeighbor(row, 'in'));
	}

	async neighborhood(id: string): Promise<NeighborRef[]> {
		const outgoing = await this.store.run(
			`MATCH (center:GraphNode {id: $id})-[e:Edge]->(other:GraphNode)
			RETURN ${RETURN_REF('other')}, e.kind AS edgeKind, e.metadata AS edgeMetadata`,
			{ id },
		);
		const incoming = await this.store.run(
			`MATCH (center:GraphNode {id: $id})<-[e:Edge]-(other:GraphNode)
			RETURN ${RETURN_REF('other')}, e.kind AS edgeKind, e.metadata AS edgeMetadata`,
			{ id },
		);
		return [
			...outgoing.map((row) => GraphQuery.toNeighbor(row, 'out')),
			...incoming.map((row) => GraphQuery.toNeighbor(row, 'in')),
		];
	}

	async find(pattern: string): Promise<SymbolRef[]> {
		const rows = await this.store.run(
			`MATCH (n:GraphNode)
			WHERE n.kind <> 'Module' AND lower(n.name) CONTAINS lower($pattern)
			RETURN ${RETURN_REF('n')}
			ORDER BY filePath, startLine
			LIMIT 50`,
			{ pattern },
		);
		return GraphQuery.toRefs(rows);
	}

	/**
	 * Ranks nodes by optimization leverage, returning the top-N for a chosen
	 * metric alongside the context needed to read the result.
	 *
	 * Runtime metrics (`self-time`, `samples`) read `metadata.runtime`; static
	 * metrics (`callers`, `call-count`, `blast-radius`) are derived from the
	 * inbound `CALLS` graph. The whole graph is read once (nodes, and the call
	 * edges when a static metric is used) and ranked in memory rather than per
	 * node, so `blast-radius` does not fan out into one traversal per node.
	 *
	 * The default metric is `self-time` on an enriched graph and `callers`
	 * otherwise. Asking for a runtime metric on an un-enriched graph does not
	 * return empty: it falls back to `callers` and flags `fellBack` so the caller
	 * can say so. Nodes that score zero on the chosen metric are omitted — a
	 * symbol nothing calls is not a fan-in hotspot.
	 */
	async hotspots(options: HotspotOptions = {}): Promise<HotspotReport> {
		const nodes = await this.store.readNodes();
		const enriched = nodes.some((node) => GraphQuery.hasRuntime(node.metadata));
		const requested: HotspotMetric = options.by ?? (enriched === true ? 'self-time' : 'callers');
		const fellBack = GraphQuery.isRuntimeMetric(requested) === true && enriched === false;
		const metric: HotspotMetric = fellBack === true ? 'callers' : requested;
		const measuredOnly = options.measuredOnly === true;
		const limit = GraphQuery.clampLimit(options.limit);

		const scores = await this.scoreNodes(nodes, metric);
		const candidates = measuredOnly === true
			? nodes.filter((node) => GraphQuery.hasRuntime(node.metadata))
			: nodes;

		const hotspots = candidates
			.map((node) => ({ node, score: scores.get(node.id) ?? 0 }))
			.filter((entry) => entry.score > 0)
			.sort((a, b) =>
				b.score - a.score
				|| a.node.filePath.localeCompare(b.node.filePath)
				|| a.node.startLine - b.node.startLine)
			.slice(0, limit)
			.map((entry) => GraphQuery.toHotspot(entry.node, entry.score, metric));

		return { metric, requested, enriched, fellBack, measuredOnly, hotspots };
	}

	/** Builds a node-id → score map for the chosen metric, reading call edges only when a static metric needs them. */
	private async scoreNodes(nodes: StoredNode[], metric: HotspotMetric): Promise<Map<string, number>> {
		if (metric === 'self-time' || metric === 'samples') {
			const key = metric === 'self-time' ? 'selfMs' : 'samples';
			return new Map(nodes.map((node) => [node.id, GraphQuery.runtimeValue(node.metadata, key)]));
		}
		const edges = await this.readCallEdges();
		if (metric === 'call-count') {
			return GraphQuery.sumInbound(edges, (edge) => edge.count);
		}
		if (metric === 'blast-radius') {
			return GraphQuery.blastRadiusSizes(nodes, edges);
		}
		return GraphQuery.sumInbound(edges, () => 1);
	}

	/** Reads every `CALLS` edge with its call-site `count` decoded from edge metadata. */
	private async readCallEdges(): Promise<CallEdge[]> {
		const rows = await this.store.run(
			`MATCH (caller:GraphNode)-[e:Edge]->(callee:GraphNode)
			WHERE e.kind = 'CALLS'
			RETURN caller.id AS fromId, callee.id AS toId, e.metadata AS metadata`,
		);
		return rows.map((row) => ({
			fromId: String(row.fromId),
			toId: String(row.toId),
			count: GraphQuery.callCount(row.metadata),
		}));
	}

	/** Sums a per-edge weight onto each edge's target, yielding inbound fan-in (`weight = 1`) or call-count (`weight = count`). */
	private static sumInbound(edges: CallEdge[], weight: (edge: CallEdge) => number): Map<string, number> {
		const totals = new Map<string, number>();
		for (const edge of edges) {
			totals.set(edge.toId, (totals.get(edge.toId) ?? 0) + weight(edge));
		}
		return totals;
	}

	/** Computes, for every node, the number of distinct nodes that transitively reach it through inbound `CALLS`. */
	private static blastRadiusSizes(nodes: StoredNode[], edges: CallEdge[]): Map<string, number> {
		const callers = new Map<string, string[]>();
		for (const edge of edges) {
			const bucket = callers.get(edge.toId);
			if (bucket === undefined) {
				callers.set(edge.toId, [edge.fromId]);
			} else {
				bucket.push(edge.fromId);
			}
		}
		const sizes = new Map<string, number>();
		for (const node of nodes) {
			sizes.set(node.id, GraphQuery.reachableCount(node.id, callers));
		}
		return sizes;
	}

	/** Counts the distinct ancestors of `start` over the reverse-call adjacency, cycle-safe and excluding `start` itself. */
	private static reachableCount(start: string, callers: Map<string, string[]>): number {
		const visited = new Set<string>();
		const stack = [...(callers.get(start) ?? [])];
		while (stack.length > 0) {
			const id = stack.pop();
			if (id === undefined || visited.has(id) === true) {
				continue;
			}
			visited.add(id);
			for (const next of callers.get(id) ?? []) {
				if (visited.has(next) === false) {
					stack.push(next);
				}
			}
		}
		visited.delete(start);
		return visited.size;
	}

	private static toHotspot(node: StoredNode, score: number, metric: HotspotMetric): HotspotRef {
		return {
			id: node.id,
			kind: node.kind,
			name: node.name,
			filePath: node.filePath,
			startLine: node.startLine,
			metadata: node.metadata,
			score,
			metric,
		};
	}

	private static isRuntimeMetric(metric: HotspotMetric): boolean {
		return metric === 'self-time' || metric === 'samples';
	}

	/** Reads a numeric metric out of `metadata.runtime`, defaulting to 0 when absent or non-numeric. */
	private static runtimeValue(metadata: Record<string, unknown>, key: string): number {
		const runtime = metadata.runtime;
		if (typeof runtime !== 'object' || runtime === null) {
			return 0;
		}
		const value = (runtime as Record<string, unknown>)[key];
		return typeof value === 'number' ? value : 0;
	}

	private static hasRuntime(metadata: Record<string, unknown>): boolean {
		const runtime = metadata.runtime;
		return typeof runtime === 'object' && runtime !== null;
	}

	/** Decodes an edge's call-site `count`, defaulting to 1 (the minimum the builder records). */
	private static callCount(value: KuzuValue): number {
		const metadata = GraphQuery.parseMetadata(value);
		const count = metadata.count;
		return typeof count === 'number' && count > 0 ? count : 1;
	}

	private static clampLimit(limit: number | undefined): number {
		if (limit === undefined || Number.isFinite(limit) === false) {
			return 20;
		}
		const floored = Math.floor(limit);
		if (floored < 1) {
			return 20;
		}
		return floored > 1000 ? 1000 : floored;
	}

	private static toRefs(rows: Record<string, KuzuValue>[]): SymbolRef[] {
		return rows.map((row) => GraphQuery.toRef(row));
	}

	private static toRef(row: Record<string, KuzuValue>): SymbolRef {
		return {
			id: String(row.id),
			kind: String(row.kind),
			name: String(row.name),
			filePath: String(row.filePath),
			startLine: Number(row.startLine),
			metadata: GraphQuery.parseMetadata(row.metadata),
		};
	}

	private static toNeighbor(row: Record<string, KuzuValue>, direction: 'in' | 'out'): NeighborRef {
		return {
			...GraphQuery.toRef(row),
			edgeKind: String(row.edgeKind),
			edgeMetadata: GraphQuery.parseMetadata(row.edgeMetadata),
			direction,
		};
	}

	/**
	 * Decodes the JSON `metadata` column back into a record. A missing, empty, or
	 * malformed value decodes to an empty object so callers always receive a record.
	 */
	private static parseMetadata(value: KuzuValue): Record<string, unknown> {
		if (typeof value !== 'string' || value.length === 0) {
			return {};
		}
		try {
			const parsed: unknown = JSON.parse(value);
			if (typeof parsed === 'object' && parsed !== null) {
				return parsed as Record<string, unknown>;
			}
			return {};
		} catch {
			return {};
		}
	}

	private static clampDepth(depth: number): number {
		if (Number.isFinite(depth) === false) {
			return 5;
		}
		const floored = Math.floor(depth);
		if (floored < 1) {
			return 1;
		}
		return floored > KUZU_MAX_REL_BOUND ? KUZU_MAX_REL_BOUND : floored;
	}
}
