import { z } from 'zod';

/**
 * The `GraphMeta` key under which the runtime ingest manifest is stored. It lives
 * at the graph level — one record for the whole graph — rather than on a node,
 * which is why it does not collide with the per-node `metadata.runtime`.
 */
export const RUNTIME_MANIFEST_KEY = 'runtime';

/**
 * Graph-level coverage facts recorded by `enrich`: how much of the profiled cost
 * was attributed to graph nodes versus dropped by the join. Persisted so a later
 * query — `cost` in particular — can report **coverage** (the fraction of total
 * measured cost the attribution actually accounts for) instead of silently
 * presenting a partial picture. `total*` are profile-wide; `matched*` are the part
 * attached to nodes; the difference is what the join dropped.
 */
export const RuntimeManifestSchema = z.object({
	source: z.string(),
	totalSamples: z.number(),
	matchedSamples: z.number(),
	totalSelfMicros: z.number(),
	matchedSelfMicros: z.number(),
});

export type RuntimeManifest = z.infer<typeof RuntimeManifestSchema>;
