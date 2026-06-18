import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../src/db/database.js';
import { Seed } from '../src/db/seed.js';
import { SearchService } from '../src/services/search_service.js';

function freshDatabase(): Database {
	const database = new Database({ path: ':memory:', journalMode: 'MEMORY', synchronous: 'OFF', cacheSizeKib: 2000 });
	Seed.run(database, { products: 200, orders: 0, maxItemsPerOrder: 1, seed: 0x7 });
	database.resetCounters();
	return database;
}

test('search returns substring matches ranked by descending score', () => {
	const database = freshDatabase();
	const hits = SearchService.search(database, 'lamp', 5);
	assert.ok(hits.length > 0);
	assert.ok(hits.length <= 5);
	for (const hit of hits) {
		assert.ok(hit.product.name.toLowerCase().includes('lamp'));
		assert.ok(hit.score > 0);
	}
	for (let index = 1; index < hits.length; index += 1) {
		assert.ok(hits[index - 1].score >= hits[index].score);
	}
});

test('search runs one query and ranks in JS (planted inefficiency)', () => {
	const database = freshDatabase();
	const hits = SearchService.search(database, 'lamp', 5);
	const counters = database.snapshot();
	assert.equal(counters.queries, 1);
	// rowsRead is the full LIKE match set, materialized into JS before ranking/slicing.
	assert.ok(counters.rowsRead >= hits.length);
});
