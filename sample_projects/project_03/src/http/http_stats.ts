let requestCount = 0;

/**
 * Module-level instrumentation: a running count of outbound HTTP requests. Each
 * client records one request per upstream call through {@link HttpStats.record}, so
 * an optimisation such as adding a response cache is verifiable as a drop in the
 * count — deterministic, independent of network timing (the same idea as the query
 * counters in `project_04`).
 *
 * Because the counter is a module-level `let`, the graph also carries `WRITES`
 * edges from {@link HttpStats.record} and {@link HttpStats.reset} to it.
 */
export class HttpStats {
	/** Record one outbound HTTP request. */
	static record(): void {
		requestCount += 1;
	}

	/** How many requests have been recorded since the last {@link HttpStats.reset}. */
	static count(): number {
		return requestCount;
	}

	/** Reset the request counter to zero. */
	static reset(): void {
		requestCount = 0;
	}
}
