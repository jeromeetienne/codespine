import type { Database } from '../db/database.js';
import type { Product, SearchHit } from '../types/domain.js';

const SELECT_COLUMNS = 'id, name, description, category, price_cents AS priceCents, stock, created_at AS createdAt';

/** Product name search with relevance ranking. */
export class SearchService {
	/**
	 * Searches product names for `query` and returns the top hits by relevance.
	 *
	 * Planted inefficiency (SQL + CPU + disk): the leading-wildcard `LIKE` cannot use
	 * an index so it scans every row, and the relevance score is then computed and
	 * sorted in JS over the full match set. The fix is an FTS5 index (or a prefix
	 * index) and pushing the ranking and `LIMIT` into SQL.
	 */
	static search(database: Database, query: string, limit: number): SearchHit[] {
		const rows = database.all<Product>(
			`SELECT ${SELECT_COLUMNS} FROM products WHERE name LIKE ?`,
			[`%${query}%`],
		);
		const hits = rows.map((product) => ({ product, score: SearchService.score(product.name, query) }));
		hits.sort((left, right) => right.score - left.score);
		return hits.slice(0, limit);
	}

	/** Cheap relevance score: every match contributes, earlier matches more. */
	private static score(name: string, query: string): number {
		const haystack = name.toLowerCase();
		const needle = query.toLowerCase();
		if (needle === '') {
			return 0;
		}
		let score = 0;
		let index = haystack.indexOf(needle);
		while (index !== -1) {
			score += Math.max(1, 100 - index);
			index = haystack.indexOf(needle, index + 1);
		}
		return score;
	}
}
