import type { Request, Response } from 'express';
import type { Database } from '../db/database.js';
import { OrdersService } from '../services/orders_service.js';
import type { CreateOrderInput } from '../types/domain.js';

/** Express handler for creating orders. */
export class OrdersRoutes {
	/** `POST /orders` — create an order from a `{ customer, items }` body. */
	static create(request: Request, response: Response): void {
		const database = request.app.locals.database as Database;
		const input = request.body as CreateOrderInput;
		if (input === undefined || typeof input.customer !== 'string' || Array.isArray(input.items) === false) {
			response.status(400).json({ error: 'invalid order' });
			return;
		}
		response.status(201).json(OrdersService.create(database, input));
	}
}
