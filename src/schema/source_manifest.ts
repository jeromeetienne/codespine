import { z } from 'zod';

/**
 * The `GraphMeta` key under which the source-repository manifest is stored. Like
 * {@link RUNTIME_MANIFEST_KEY}, it is a graph-level record — one per graph — and
 * is written by `load` from the provenance `extract` captured at parse time.
 */
export const SOURCE_MANIFEST_KEY = 'source';

/**
 * Git provenance of the analysed project, captured by `extract` at the exact
 * commit and root it parsed so the `web` visualisation can turn each file path
 * into a GitHub permalink. `prefix` is the analysed root's path within the
 * repository — `''` at the repo root, otherwise `sub/dir/` with a trailing
 * slash — and is prepended to each node's root-relative `filePath` to form the
 * repository-relative path.
 */
export const SourceManifestSchema = z.object({
	baseUrl: z.string(),
	commit: z.string(),
	prefix: z.string(),
});

export type SourceManifest = z.infer<typeof SourceManifestSchema>;
