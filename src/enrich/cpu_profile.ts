import { z } from 'zod';

/**
 * A single call frame as it appears in a V8 CPU profile node. Line and column
 * numbers are **zero-based** in the V8 inspector protocol, unlike the one-based
 * lines ts-morph (and therefore the graph's `range`) uses.
 */
const CallFrameSchema = z.object({
	functionName: z.string(),
	scriptId: z.union([z.string(), z.number()]).optional(),
	url: z.string(),
	lineNumber: z.number(),
	columnNumber: z.number(),
});

const ProfileNodeSchema = z.object({
	id: z.number(),
	callFrame: CallFrameSchema,
	hitCount: z.number().optional(),
	children: z.array(z.number()).optional(),
});

/**
 * The on-disk shape of a `node --cpu-prof` output (`.cpuprofile`). `samples`
 * holds one profile-node id per sampling tick; `timeDeltas` holds the elapsed
 * microseconds preceding each tick. Both are optional because some producers
 * emit only per-node `hitCount`.
 */
export const CpuProfileSchema = z.object({
	nodes: z.array(ProfileNodeSchema),
	startTime: z.number().optional(),
	endTime: z.number().optional(),
	samples: z.array(z.number()).optional(),
	timeDeltas: z.array(z.number()).optional(),
});
export type CpuProfileData = z.infer<typeof CpuProfileSchema>;

/**
 * One executing location distilled from the profile: its call frame plus the
 * self time and sample count attributed to it. `line` is converted to the
 * one-based convention so it can be compared against graph node ranges.
 */
export type FrameSample = {
	functionName: string;
	url: string;
	line: number;
	column: number;
	samples: number;
	selfMicros: number;
};

export class CpuProfile {
	/**
	 * Parses and validates raw `.cpuprofile` JSON text. Throws a `ZodError` if
	 * the document does not match the V8 profile shape.
	 */
	static parse(jsonText: string): CpuProfileData {
		return CpuProfileSchema.parse(JSON.parse(jsonText));
	}

	/**
	 * Collapses the profile into one {@link FrameSample} per profile node that
	 * received at least one sample.
	 *
	 * Self time is summed from `timeDeltas`, attributing `timeDeltas[i]` to
	 * `samples[i]` — the standard self-time approximation where total attributed
	 * time equals the sum of all deltas. When `samples`/`timeDeltas` are absent,
	 * it falls back to each node's `hitCount` with zero self time.
	 */
	static aggregate(profile: CpuProfileData): FrameSample[] {
		const samplesByNode = new Map<number, number>();
		const microsByNode = new Map<number, number>();

		const samples = profile.samples;
		if (samples !== undefined && samples.length > 0) {
			const deltas = profile.timeDeltas ?? [];
			for (let index = 0; index < samples.length; index += 1) {
				const nodeId = samples[index];
				samplesByNode.set(nodeId, (samplesByNode.get(nodeId) ?? 0) + 1);
				const delta = deltas[index] ?? 0;
				const safeDelta = delta > 0 ? delta : 0;
				microsByNode.set(nodeId, (microsByNode.get(nodeId) ?? 0) + safeDelta);
			}
		} else {
			for (const node of profile.nodes) {
				const hits = node.hitCount ?? 0;
				if (hits > 0) {
					samplesByNode.set(node.id, hits);
				}
			}
		}

		const frames: FrameSample[] = [];
		for (const node of profile.nodes) {
			const sampleCount = samplesByNode.get(node.id) ?? 0;
			if (sampleCount === 0) {
				continue;
			}
			frames.push({
				functionName: node.callFrame.functionName,
				url: node.callFrame.url,
				line: node.callFrame.lineNumber + 1,
				column: node.callFrame.columnNumber,
				samples: sampleCount,
				selfMicros: microsByNode.get(node.id) ?? 0,
			});
		}
		return frames;
	}

	/** Total number of sampling ticks in the profile, for coverage reporting. */
	static totalSamples(profile: CpuProfileData): number {
		if (profile.samples !== undefined && profile.samples.length > 0) {
			return profile.samples.length;
		}
		return profile.nodes.reduce((sum, node) => sum + (node.hitCount ?? 0), 0);
	}
}
