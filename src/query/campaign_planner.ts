import { GraphQuery, HotspotMetric, HotspotReport, SymbolRef } from './graph_query.js';

/** How `/codespine-optimize` can take a campaign item — mirrors the optimizer's own task classes. */
export type CampaignReadiness = 'auto-applicable' | 'needs-workload' | 'manual';

/** Which graph signal surfaced the candidate. */
export type CampaignCandidate = 'dead-export' | 'hotspot';

/** One ranked, de-risked entry in a campaign worklist. */
export type CampaignItem = SymbolRef & {
	candidate: CampaignCandidate;
	readiness: CampaignReadiness;
	/** Hotspot leverage score; `0` for a dead export, whose value is the safe removal itself. */
	score: number;
	/** The metric `score` is expressed in for a hotspot; `null` for a dead export. */
	metric: HotspotMetric | null;
	/** Size of the transitive inbound `CALLS` impact set — the change-risk bound. `0` for a dead export. */
	blastRadius: number;
};

/**
 * A campaign worklist plus the context needed to read it: how hotspots were
 * ranked, whether that ranking is measured or a static fallback, and the
 * blast-radius ceiling that separates `needs-workload` from `manual`.
 */
export type CampaignReport = {
	/** Whether hotspots were ranked by measured runtime (`enrich`) rather than static fan-in. */
	enriched: boolean;
	/** The metric hotspots were ranked by. */
	metric: HotspotMetric;
	/** True when a runtime metric fell back to a static one because the graph is un-enriched. */
	fellBack: boolean;
	/** The blast-radius ceiling above which a hotspot is `manual` instead of `needs-workload`. */
	maxBlastRadius: number;
	/** The worklist, ordered: safe removals first, then hotspots by leverage, `manual` last. */
	items: CampaignItem[];
};

export type CampaignOptions = {
	/** Maximum number of items to return. Defaults to 20, clamped to [1, 1000]. */
	limit?: number;
	/** Blast-radius ceiling for autonomous work; a hotspot above it is `manual`. Defaults to 25, clamped to [0, 1000]. */
	maxBlastRadius?: number;
	/** Metric to rank hotspots by; defaults like `hotspots`: `self-time` when enriched, `callers` otherwise. */
	by?: HotspotMetric;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 1000;
const DEFAULT_MAX_BLAST_RADIUS = 25;
const BLAST_RADIUS_DEPTH = 10;

/** Worklist order: safe removals first, then bounded hotspots, then the manual ones. */
const READINESS_RANK: Record<CampaignReadiness, number> = {
	'auto-applicable': 0,
	'needs-workload': 1,
	'manual': 2,
};

/**
 * Composes the graph's safety signals into a single ranked optimization
 * worklist — the deterministic "plan" a campaign run works through. It surfaces
 * the safest dead-code removals and the highest-leverage hotspots, and tags each
 * with how `/codespine-optimize` may take it, using the transitive blast radius
 * as the change-risk bound. It applies no edits and asserts no runtime
 * improvement — only the optimizer's `benchmark` gate can earn that claim.
 */
export class CampaignPlanner {
	static async plan(query: GraphQuery, options: CampaignOptions = {}): Promise<CampaignReport> {
		const limit = CampaignPlanner.clamp(options.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
		const maxBlastRadius = CampaignPlanner.clamp(options.maxBlastRadius ?? DEFAULT_MAX_BLAST_RADIUS, 0, MAX_LIMIT);

		const removals = await CampaignPlanner.safeRemovals(query);
		const report = await query.hotspots({ by: options.by, limit });
		const hotspots = await CampaignPlanner.rankedHotspots(query, report, maxBlastRadius);

		const items = [...removals, ...hotspots]
			.sort((a, b) =>
				READINESS_RANK[a.readiness] - READINESS_RANK[b.readiness]
				|| b.score - a.score
				|| a.filePath.localeCompare(b.filePath)
				|| a.startLine - b.startLine)
			.slice(0, limit);

		return {
			enriched: report.enriched,
			metric: report.metric,
			fellBack: report.fellBack,
			maxBlastRadius,
			items,
		};
	}

	/**
	 * Dead exports are zero-reference by construction (a dead export has no inbound
	 * `CALLS`), so their blast radius is 0 and they are always `auto-applicable` —
	 * the safest wins, taken first.
	 */
	private static async safeRemovals(query: GraphQuery): Promise<CampaignItem[]> {
		const dead = await query.deadExports();
		return dead.map((ref) => ({
			...ref,
			candidate: 'dead-export',
			readiness: 'auto-applicable',
			score: 0,
			metric: null,
			blastRadius: 0,
		}));
	}

	/**
	 * A hotspot is a runtime-improvement candidate, so it can only be *claimed* with
	 * a benchmark — hence `needs-workload`. Its transitive inbound `CALLS` size
	 * bounds the change: within the ceiling it stays `needs-workload`; above it the
	 * symbol is too coupled to touch in one autonomous pass, so it is `manual`.
	 */
	private static async rankedHotspots(query: GraphQuery, report: HotspotReport, maxBlastRadius: number): Promise<CampaignItem[]> {
		const items: CampaignItem[] = [];
		for (const hotspot of report.hotspots) {
			const blastRadius = (await query.blastRadius(hotspot.id, BLAST_RADIUS_DEPTH)).length;
			const readiness: CampaignReadiness = blastRadius <= maxBlastRadius ? 'needs-workload' : 'manual';
			items.push({
				...hotspot,
				candidate: 'hotspot',
				readiness,
				blastRadius,
			});
		}
		return items;
	}

	private static clamp(value: number, min: number, max: number): number {
		if (Number.isFinite(value) === false) {
			return min;
		}
		const floored = Math.floor(value);
		if (floored < min) {
			return min;
		}
		return floored > max ? max : floored;
	}
}
