import type { Database } from '../db/database.js';
import type { CategorySales } from '../types/domain.js';

type OrderItemRow = {
	productId: number;
	quantity: number;
	unitPriceCents: number;
};

type ProductCategoryRow = {
	id: number;
	category: string;
};

/** Reporting / aggregation over the order history. */
export class StatsService {
	/**
	 * Summarizes sales per product category, ordered by revenue.
	 *
	 * Planted inefficiency (SQL + CPU + disk): it reads every order item and every
	 * product into memory and does the join, grouping, and aggregation in JS. The fix
	 * is a single `JOIN ... GROUP BY ... ORDER BY` that lets SQLite aggregate.
	 */
	static summary(database: Database): CategorySales[] {
		const items = database.all<OrderItemRow>(
			'SELECT product_id AS productId, quantity, unit_price_cents AS unitPriceCents FROM order_items',
		);
		const products = database.all<ProductCategoryRow>('SELECT id, category FROM products');
		const categoryById = new Map<number, string>();
		for (const product of products) {
			categoryById.set(product.id, product.category);
		}
		const byCategory = new Map<string, CategorySales>();
		for (const item of items) {
			const category = categoryById.get(item.productId) ?? 'unknown';
			const entry = byCategory.get(category) ?? { category, lineItems: 0, unitsSold: 0, revenueCents: 0 };
			entry.lineItems += 1;
			entry.unitsSold += item.quantity;
			entry.revenueCents += item.quantity * item.unitPriceCents;
			byCategory.set(category, entry);
		}
		const summary = [...byCategory.values()];
		summary.sort((left, right) => right.revenueCents - left.revenueCents);
		return summary;
	}
}
