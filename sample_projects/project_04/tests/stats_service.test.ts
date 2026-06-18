import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../src/db/database.js';
import { Seed } from '../src/db/seed.js';
import { StatsService } from '../src/services/stats_service.js';

function freshDatabase(): Database {
	const database = new Database({ path: ':memory:', journalMode: 'MEMORY', synchronous: 'OFF', cacheSizeKib: 2000 });
	Seed.run(database, { products: 30, orders: 60, maxItemsPerOrder: 4, seed: 0x99 });
	database.resetCounters();
	return database;
}

test('summary aggregates per category and sorts by descending revenue', () => {
	const database = freshDatabase();
	const summary = StatsService.summary(database);
	assert.ok(summary.length > 0);
	for (const row of summary) {
		assert.ok(row.revenueCents >= 0);
		assert.ok(row.unitsSold >= row.lineItems);
	}
	for (let index = 1; index < summary.length; index += 1) {
		assert.ok(summary[index - 1].revenueCents >= summary[index].revenueCents);
	}
});

test('summary reads every item and product into JS (planted inefficiency)', () => {
	const database = freshDatabase();
	StatsService.summary(database);
	const counters = database.snapshot();
	// Two full-table reads (items, products); the join and grouping happen in JS.
	assert.equal(counters.queries, 2);
	assert.ok(counters.rowsRead >= 30);
});
