import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../src/db/database.js';
import { Seed } from '../src/db/seed.js';
import { OrdersService } from '../src/services/orders_service.js';

function freshDatabase(): Database {
	const database = new Database({ path: ':memory:', journalMode: 'MEMORY', synchronous: 'OFF', cacheSizeKib: 2000 });
	Seed.run(database, { products: 20, orders: 0, maxItemsPerOrder: 1, seed: 0x55 });
	database.resetCounters();
	return database;
}

test('create computes the order total from product prices', () => {
	const database = freshDatabase();
	const created = OrdersService.create(database, {
		customer: 'alice',
		items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }],
	});
	assert.equal(created.itemCount, 2);
	assert.ok(created.orderId > 0);
	assert.ok(created.totalCents > 0);
});

test('create issues N+1 queries and opens no transaction (planted inefficiency)', () => {
	const database = freshDatabase();
	OrdersService.create(database, {
		customer: 'bob',
		items: [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }, { productId: 3, quantity: 1 }],
	});
	const counters = database.snapshot();
	// 1 order insert + 3 price lookups + 3 item inserts + 1 total update = 8 queries.
	assert.equal(counters.queries, 8);
	assert.equal(counters.transactions, 0);
});
