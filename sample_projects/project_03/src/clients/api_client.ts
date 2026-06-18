import { HttpStats } from '../http/http_stats.js';

/** A named upstream data source reachable over HTTP. */
export interface ApiResource {
	/** A short identifier for the upstream service (its host). */
	source(): string;
}

/**
 * Shared base for the typed API clients, and the project's heritage anchor: it
 * `implements` {@link ApiResource}, and every concrete client `extends` it and
 * `override`s {@link BaseApiClient.source}.
 *
 * Each concrete client owns its `fetch` call site with a static URL — so the graph
 * names the `ExternalAPI` host and roots the `CALLS_EXTERNAL` edge at the client
 * method — and hands the pending response here. The base centralises request
 * counting and JSON parsing.
 */
export abstract class BaseApiClient implements ApiResource {
	/** A short identifier for the upstream service (its host). */
	abstract source(): string;

	/** Count one outbound request and parse its JSON body into the domain type. */
	protected async receive<T>(response: Promise<Response>): Promise<T> {
		HttpStats.record();
		const resolved = await response;
		return (await resolved.json()) as T;
	}
}
