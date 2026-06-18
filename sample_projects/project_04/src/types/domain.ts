/** A product row as stored in the `products` table. */
export type Product = {
	id: number;
	name: string;
	description: string;
	category: string;
	priceCents: number;
	stock: number;
	createdAt: number;
};

/** A page of products returned by `GET /products`. */
export type ProductPage = {
	page: number;
	pageSize: number;
	total: number;
	items: Product[];
};

/** A search hit with its computed relevance score, returned by `GET /search`. */
export type SearchHit = {
	product: Product;
	score: number;
};

/** One line item in a `POST /orders` request. */
export type OrderItemInput = {
	productId: number;
	quantity: number;
};

/** The body accepted by `POST /orders`. */
export type CreateOrderInput = {
	customer: string;
	items: OrderItemInput[];
};

/** The result of creating an order. */
export type CreatedOrder = {
	orderId: number;
	totalCents: number;
	itemCount: number;
};

/** One row of the per-category sales summary returned by `GET /stats`. */
export type CategorySales = {
	category: string;
	lineItems: number;
	unitsSold: number;
	revenueCents: number;
};
