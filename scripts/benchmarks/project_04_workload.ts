// A repeatable benchmark workload for sample_projects/project_04: it seeds an
// in-memory SQLite database deterministically and drives the real service
// functions under load, so the V8 sampler catches the in-project hot frames
// (ProductsService.list, SearchService.search, StatsService.summary, and the
// better-sqlite3 calls behind them).
//
// Determinism: a fixed seed builds byte-identical data and the workload returns
// only deterministic fields (call counts, query counters, a numeric sink) — no
// timing — so a fixed seed yields an identical report and it is usable in the
// test loop. It lives OUTSIDE the extracted source root, so it never becomes a
// graph node.
//
// Run it:  npm run project04:workload   (or)  npx tsx scripts/benchmarks/project_04_workload.ts
import { pathToFileURL } from 'node:url';
import { Database } from '../../sample_projects/project_04/src/db/database.js';
import type { QueryCounters } from '../../sample_projects/project_04/src/db/database.js';
import { Seed } from '../../sample_projects/project_04/src/db/seed.js';
import { ProductsService } from '../../sample_projects/project_04/src/services/products_service.js';
import { SearchService } from '../../sample_projects/project_04/src/services/search_service.js';
import { OrdersService } from '../../sample_projects/project_04/src/services/orders_service.js';
import { StatsService } from '../../sample_projects/project_04/src/services/stats_service.js';

/** How much data to seed and how hard to drive the services. */
type Workload = {
	products: number;
	orders: number;
	iterations: number;
	seed: number;
};

/** Per-endpoint call counts plus the database counters after the run. */
type WorkloadReport = {
	iterations: number;
	calls: { list: number; getById: number; search: number; createOrder: number; stats: number };
	counters: QueryCounters;
	sink: number;
};

/** The search terms cycled through; each matches a slice of the generated names. */
const SEARCH_TERMS = ['lamp', 'classic', 'mini', 'desk', 'smart'] as const;

/** The default workload: modest so the determinism test stays fast, but enough to profile. */
export const DEFAULT_WORKLOAD: Workload = {
	products: 2000,
	orders: 3000,
	iterations: 800,
	seed: 0x04040404,
};

/**
 * Runs the deterministic service-call workload and returns call counts and query
 * counters. Pure with respect to its inputs: a fixed workload always yields the
 * same report (timing is deliberately excluded).
 */
export function runWorkload(workload: Workload = DEFAULT_WORKLOAD): WorkloadReport {
	const database = new Database({ path: ':memory:', journalMode: 'MEMORY', synchronous: 'OFF', cacheSizeKib: 2000 });
	Seed.run(database, { products: workload.products, orders: workload.orders, maxItemsPerOrder: 5, seed: workload.seed });
	database.resetCounters();

	const calls = { list: 0, getById: 0, search: 0, createOrder: 0, stats: 0 };
	let sink = 0;
	for (let index = 0; index < workload.iterations; index += 1) {
		sink += ProductsService.list(database, (index % 20) + 1, 20).items.length;
		calls.list += 1;
		sink += ProductsService.getById(database, (index % workload.products) + 1)?.stock ?? 0;
		calls.getById += 1;
		sink += SearchService.search(database, SEARCH_TERMS[index % SEARCH_TERMS.length], 10).length;
		calls.search += 1;
		if (index % 10 === 0) {
			const created = OrdersService.create(database, {
				customer: `customer_${index}`,
				items: [
					{ productId: (index % workload.products) + 1, quantity: 2 },
					{ productId: ((index * 7) % workload.products) + 1, quantity: 1 },
				],
			});
			sink += created.totalCents;
			calls.createOrder += 1;
		}
		if (index % 50 === 0) {
			sink += StatsService.summary(database).length;
			calls.stats += 1;
		}
	}

	const counters = database.snapshot();
	database.close();
	return { iterations: workload.iterations, calls, counters, sink };
}

/** Render a report as a human-readable block. */
export function formatReport(report: WorkloadReport): string {
	const lines: string[] = [];
	lines.push('shop-sqlite workload (deterministic, in-memory)');
	lines.push(`  iterations:   ${report.iterations}`);
	lines.push(
		`  calls:        list=${report.calls.list} getById=${report.calls.getById} ` +
			`search=${report.calls.search} createOrder=${report.calls.createOrder} stats=${report.calls.stats}`,
	);
	lines.push(`  queries:      ${report.counters.queries}`);
	lines.push(`  rowsRead:     ${report.counters.rowsRead}`);
	lines.push(`  prepares:     ${report.counters.prepares} (cacheHits=${report.counters.prepareCacheHits})`);
	lines.push(`  transactions: ${report.counters.transactions}`);
	return lines.join('\n');
}

/** Run the default workload and print its report plus an advisory wall time. */
function main(): void {
	const started = performance.now();
	const report = runWorkload();
	const elapsedMs = performance.now() - started;
	console.log(formatReport(report));
	console.log(`  wall time:    ${elapsedMs.toFixed(0)} ms (advisory; realism-track timing is noisy)`);
}

const invokedDirectly =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly === true) {
	main();
}
