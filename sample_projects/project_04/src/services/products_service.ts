import type { Database } from '../db/database.js';
import type { Product, ProductPage } from '../types/domain.js';

const SELECT_COLUMNS = 'id, name, description, category, price_cents AS priceCents, stock, created_at AS createdAt';

/** Read paths for the product catalogue. */
export class ProductsService {
	/**
	 * Lists a page of products ordered by price.
	 *
	 * Planted inefficiency (SQL + disk): `price_cents` has no index, and the query
	 * fetches every row before the page is sliced in JS — so each call scans and
	 * sorts the whole table. The fix is an index on `price_cents` plus
	 * `LIMIT`/`OFFSET` pushdown.
	 */
	static list(database: Database, page: number, pageSize: number): ProductPage {
		const rows = database.all<Product>(
			`SELECT ${SELECT_COLUMNS} FROM products ORDER BY price_cents DESC`,
		);
		const start = (page - 1) * pageSize;
		const items = rows.slice(start, start + pageSize);
		return { page, pageSize, total: rows.length, items };
	}

	/**
	 * Fetches one product by id.
	 *
	 * Planted inefficiency (CPU + SQL): the statement is re-prepared on every call
	 * (no `cache` option) instead of reusing a cached prepared statement.
	 */
	static getById(database: Database, id: number): Product | undefined {
		return database.get<Product>(
			`SELECT ${SELECT_COLUMNS} FROM products WHERE id = ?`,
			[id],
		);
	}
}
