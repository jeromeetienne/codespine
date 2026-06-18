import { BriefService } from './brief/brief_service.js';
import { HttpStats } from './http/http_stats.js';

/**
 * A tiny end-to-end example, runnable with `npm run dev` (or `npx tsx
 * src/main.ts`). It calls the real public APIs, so it needs network access;
 * offline, it prints the failure instead of crashing.
 *
 * `main` is not exported, so it roots the call graph: its call to
 * {@link BriefService.brief} gives the clients — and, transitively, their `fetch`
 * call sites — genuine inbound `CALLS` / `INSTANTIATES` / `CALLS_EXTERNAL` edges.
 */
async function main(): Promise<void> {
	HttpStats.reset();
	try {
		const brief = await BriefService.brief();
		console.log(brief);
		console.log(`(${HttpStats.count()} upstream requests)`);
	} catch (error) {
		console.error('brief failed (offline?):', error);
	}
}

void main();
