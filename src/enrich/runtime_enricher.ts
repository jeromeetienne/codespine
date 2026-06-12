import { KuzuStore } from '../store/kuzu_store.js';
import { CpuProfile } from './cpu_profile.js';
import { DroppedFrameGroup, RuntimeAttribution, RuntimeJoin } from './runtime_join.js';

/** The telemetry source tag written into `metadata.runtime.source`. */
export const RUNTIME_SOURCE_CPU_PROFILE = 'v8-cpuprofile';

/** Namespaced key under which runtime metrics are stored on a node's metadata. */
export const RUNTIME_METADATA_KEY = 'runtime';

/**
 * The measured-weight metrics attached to a node under `metadata.runtime`. The
 * shape is intentionally open-ended (latency, call frequency, cost, … may join
 * later); a CPU profile populates self time and sample count.
 */
export type RuntimeMetrics = {
	source: string;
	samples: number;
	selfMicros: number;
	selfMs: number;
};

export type Hotspot = {
	id: string;
	name: string;
	kind: string;
	filePath: string;
	selfMs: number;
	samples: number;
};

export type EnrichReport = {
	totalSamples: number;
	matchedNodes: number;
	matchedFrames: number;
	matchedSamples: number;
	matchedSelfMs: number;
	matchedByName: number;
	matchedByRange: number;
	droppedFrames: number;
	droppedSamples: number;
	dropped: DroppedFrameGroup[];
	hotspots: Hotspot[];
};

export type EnrichOptions = {
	/** Project root the profile's absolute frame urls resolve against. */
	root: string;
};

export class RuntimeEnricher {
	/**
	 * Ingests a V8 CPU profile and attaches `metadata.runtime` (self time and
	 * sample count) onto the graph nodes whose ranges enclose the profiled
	 * frames. Existing metadata is preserved; only the `runtime` key is written,
	 * so re-running with the same profile is idempotent. Unmatched frames are
	 * counted and returned in the report rather than dropped silently.
	 */
	static async enrich(store: KuzuStore, profileText: string, options: EnrichOptions): Promise<EnrichReport> {
		const profile = CpuProfile.parse(profileText);
		const frames = CpuProfile.aggregate(profile);
		const nodes = await store.readNodes();

		const result = RuntimeJoin.join(nodes, frames, { root: options.root });

		const nodeById = new Map(nodes.map((node) => [node.id, node]));
		const updates: { id: string; metadata: Record<string, unknown> }[] = [];
		const hotspots: Hotspot[] = [];
		for (const [id, attribution] of result.attributions) {
			const node = nodeById.get(id);
			if (node === undefined) {
				continue;
			}
			const metrics = RuntimeEnricher.toMetrics(attribution);
			updates.push({
				id,
				metadata: { ...node.metadata, [RUNTIME_METADATA_KEY]: metrics },
			});
			hotspots.push({
				id,
				name: node.name,
				kind: node.kind,
				filePath: node.filePath,
				selfMs: metrics.selfMs,
				samples: metrics.samples,
			});
		}

		await store.writeNodeMetadata(updates);

		hotspots.sort((a, b) => b.selfMs - a.selfMs || b.samples - a.samples);

		return {
			totalSamples: CpuProfile.totalSamples(profile),
			matchedNodes: updates.length,
			matchedFrames: result.matchedFrames,
			matchedSamples: result.matchedSamples,
			matchedSelfMs: RuntimeEnricher.microsToMs(result.matchedSelfMicros),
			matchedByName: result.matchedByName,
			matchedByRange: result.matchedByRange,
			droppedFrames: result.droppedFrames,
			droppedSamples: result.droppedSamples,
			dropped: result.dropped,
			hotspots,
		};
	}

	private static toMetrics(attribution: RuntimeAttribution): RuntimeMetrics {
		return {
			source: RUNTIME_SOURCE_CPU_PROFILE,
			samples: attribution.samples,
			selfMicros: attribution.selfMicros,
			selfMs: RuntimeEnricher.microsToMs(attribution.selfMicros),
		};
	}

	/** Converts microseconds to milliseconds, rounded to microsecond precision. */
	private static microsToMs(micros: number): number {
		return Math.round(micros) / 1000;
	}
}
