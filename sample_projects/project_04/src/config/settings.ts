/**
 * SQLite tuning, read from the environment. The defaults are deliberately the
 * slow, unoptimized values (rollback journal, fsync on every write, a tiny page
 * cache) so the disk-tuning optimization has somewhere to start.
 */
export type DatabaseSettings = {
	path: string;
	journalMode: string;
	synchronous: string;
	cacheSizeKib: number;
};

/** Reads runtime configuration from `process.env` (the `ConfigFlag` source). */
export class Settings {
	/**
	 * Loads the database settings, falling back to deliberately un-optimized
	 * defaults. Each `process.env` read here becomes a `ConfigFlag` node in the
	 * knowledge graph, and these flags are exactly the disk-optimization knobs.
	 */
	static load(): DatabaseSettings {
		return {
			path: process.env.DB_PATH ?? ':memory:',
			journalMode: process.env.DB_JOURNAL_MODE ?? 'DELETE',
			synchronous: process.env.DB_SYNCHRONOUS ?? 'FULL',
			cacheSizeKib: Number(process.env.DB_CACHE_SIZE ?? '2000'),
		};
	}
}
