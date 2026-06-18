import type { Database } from '../db/database.js';
import type { CreatedOrder, CreateOrderInput } from '../types/domain.js';

/** The order write path. */
export class OrdersService {
	/**
	 * Creates an order and its line items.
	 *
	 * Planted inefficiencies (disk + SQL): each product price is fetched with its own
	 * query (N+1), each line item is inserted with its own statement, and nothing is
	 * wrapped in a transaction — so with the default `synchronous=FULL` rollback
	 * journal the engine fsyncs once per write. The fix is a single transaction, one
	 * batched `IN (...)` price lookup, and WAL + `synchronous=NORMAL`.
	 */
	static create(database: Database, input: CreateOrderInput): CreatedOrder {
		const createdAt = Date.now();
		const orderResult = database.run(
			'INSERT INTO orders (customer, total_cents, created_at) VALUES (?, ?, ?)',
			[input.customer, 0, createdAt],
		);
		const orderId = Number(orderResult.lastInsertRowid);
		let totalCents = 0;
		for (const item of input.items) {
			const product = database.get<{ priceCents: number }>(
				'SELECT price_cents AS priceCents FROM products WHERE id = ?',
				[item.productId],
			);
			const unitPriceCents = product?.priceCents ?? 0;
			totalCents += unitPriceCents * item.quantity;
			database.run(
				'INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)',
				[orderId, item.productId, item.quantity, unitPriceCents],
			);
		}
		database.run('UPDATE orders SET total_cents = ? WHERE id = ?', [totalCents, orderId]);
		return { orderId, totalCents, itemCount: input.items.length };
	}
}
