import type { Database } from './database.js';

/** How much data to generate. Larger values make the full-table scans bite harder. */
export type SeedOptions = {
	products: number;
	orders: number;
	maxItemsPerOrder: number;
	seed: number;
};

/** Default dataset: large enough that an unindexed scan is clearly measurable. */
export const DEFAULT_SEED_OPTIONS: SeedOptions = {
	products: 20000,
	orders: 40000,
	maxItemsPerOrder: 5,
	seed: 0x04040404,
};

const ADJECTIVES = ['classic', 'compact', 'deluxe', 'rugged', 'smart', 'vintage', 'premium', 'mini', 'heavy', 'silent'] as const;
const NOUNS = ['drill', 'lamp', 'blender', 'desk', 'tent', 'puzzle', 'novel', 'speaker', 'wrench', 'kettle'] as const;
const CATEGORIES = ['tools', 'garden', 'kitchen', 'office', 'outdoor', 'toys', 'books', 'audio'] as const;

/**
 * Builds the schema and fills it with deterministic data. The schema deliberately
 * carries no secondary indexes — the products sort, the search `LIKE`, and the
 * stats aggregation all scan whole tables until the index optimization is applied.
 */
export class Seed {
	/** Drops and recreates the tables, then inserts the generated rows. */
	static run(database: Database, options: SeedOptions = DEFAULT_SEED_OPTIONS): void {
		Seed.createSchema(database);
		Seed.fill(database, options);
	}

	/** Creates the three tables with primary keys only (no secondary indexes). */
	private static createSchema(database: Database): void {
		database.exec(`
			DROP TABLE IF EXISTS order_items;
			DROP TABLE IF EXISTS orders;
			DROP TABLE IF EXISTS products;
			CREATE TABLE products (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT NOT NULL,
				category TEXT NOT NULL,
				price_cents INTEGER NOT NULL,
				stock INTEGER NOT NULL,
				created_at INTEGER NOT NULL
			);
			CREATE TABLE orders (
				id INTEGER PRIMARY KEY,
				customer TEXT NOT NULL,
				total_cents INTEGER NOT NULL,
				created_at INTEGER NOT NULL
			);
			CREATE TABLE order_items (
				id INTEGER PRIMARY KEY,
				order_id INTEGER NOT NULL,
				product_id INTEGER NOT NULL,
				quantity INTEGER NOT NULL,
				unit_price_cents INTEGER NOT NULL
			);
		`);
	}

	/** Inserts the products, orders, and order items inside one seeding transaction. */
	private static fill(database: Database, options: SeedOptions): void {
		const random = Seed.createRandom(options.seed);
		const insertProduct = database.prepareRaw(
			'INSERT INTO products (name, description, category, price_cents, stock, created_at) VALUES (?, ?, ?, ?, ?, ?)',
		);
		const insertOrder = database.prepareRaw(
			'INSERT INTO orders (customer, total_cents, created_at) VALUES (?, ?, ?)',
		);
		const insertItem = database.prepareRaw(
			'INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)',
		);
		database.transaction(() => {
			for (let index = 0; index < options.products; index += 1) {
				const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
				const noun = NOUNS[Math.floor(random() * NOUNS.length)];
				const category = CATEGORIES[Math.floor(random() * CATEGORIES.length)];
				const name = `${adjective} ${noun} ${index}`;
				const description = `A ${adjective} ${noun} for the ${category} aisle.`;
				const priceCents = 100 + Math.floor(random() * 90000);
				const stock = Math.floor(random() * 500);
				insertProduct.run(name, description, category, priceCents, stock, index);
			}
			for (let index = 0; index < options.orders; index += 1) {
				const customer = `customer_${Math.floor(random() * 5000)}`;
				const orderResult = insertOrder.run(customer, 0, index);
				const orderId = Number(orderResult.lastInsertRowid);
				const itemCount = 1 + Math.floor(random() * options.maxItemsPerOrder);
				for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
					const productId = 1 + Math.floor(random() * options.products);
					const quantity = 1 + Math.floor(random() * 5);
					const unitPriceCents = 100 + Math.floor(random() * 90000);
					insertItem.run(orderId, productId, quantity, unitPriceCents);
				}
			}
		});
	}

	/** A small deterministic PRNG (mulberry32) so each seed is byte-identical. */
	private static createRandom(seed: number): () => number {
		let state = seed >>> 0;
		return () => {
			state = (state + 0x6d2b79f5) | 0;
			let value = Math.imul(state ^ (state >>> 15), 1 | state);
			value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
			return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
		};
	}
}
