import type { Request, Response } from 'express';
import type { Database } from '../db/database.js';
import { ProductsService } from '../services/products_service.js';

/** Express handlers for the product catalogue routes. */
export class ProductsRoutes {
	/** `GET /products` — a page of products. */
	static list(request: Request, response: Response): void {
		const database = request.app.locals.database as Database;
		const page = Number(request.query.page ?? '1');
		const pageSize = Number(request.query.pageSize ?? '20');
		response.json(ProductsService.list(database, page, pageSize));
	}

	/** `GET /products/:id` — a single product, or 404. */
	static getById(request: Request, response: Response): void {
		const database = request.app.locals.database as Database;
		const id = Number(request.params.id);
		const product = ProductsService.getById(database, id);
		if (product === undefined) {
			response.status(404).json({ error: 'product not found' });
			return;
		}
		response.json(product);
	}
}
