import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../src/db/database.js';
import { Seed } from '../src/db/seed.js';
import { ProductsService } from '../src/services/products_service.js';

function freshDatabase(): Database {
	const database = new Database({ path: ':memory:', journalMode: 'MEMORY', synchronous: 'OFF', cacheSizeKib: 2000 });
	Seed.run(database, { products: 50, orders: 0, maxItemsPerOrder: 1, seed: 0x1234 });
	database.resetCounters();
	return database;
}

test('list returns the requested page and the full total', () => {
	const database = freshDatabase();
	const page = ProductsService.list(database, 2, 10);
	assert.equal(page.total, 50);
	assert.equal(page.page, 2);
	assert.equal(page.items.length, 10);
});

test('list scans the whole table (planted inefficiency: rowsRead equals total)', () => {
	const database = freshDatabase();
	ProductsService.list(database, 1, 10);
	const counters = database.snapshot();
	assert.equal(counters.queries, 1);
	assert.equal(counters.rowsRead, 50);
});

test('getById re-prepares the statement on every call (planted inefficiency: no cache hits)', () => {
	const database = freshDatabase();
	ProductsService.getById(database, 1);
	ProductsService.getById(database, 2);
	const counters = database.snapshot();
	assert.equal(counters.prepares, 2);
	assert.equal(counters.prepareCacheHits, 0);
});

test('getById returns the product, or undefined for a missing id', () => {
	const database = freshDatabase();
	assert.equal(ProductsService.getById(database, 3)?.id, 3);
	assert.equal(ProductsService.getById(database, 999999), undefined);
});
