import type { Request, Response } from 'express';
import type { Database } from '../db/database.js';
import { SearchService } from '../services/search_service.js';

/** Express handler for product search. */
export class SearchRoutes {
	/** `GET /search?q=&limit=` — ranked product-name search. */
	static search(request: Request, response: Response): void {
		const database = request.app.locals.database as Database;
		const query = String(request.query.q ?? '');
		const limit = Number(request.query.limit ?? '10');
		response.json(SearchService.search(database, query, limit));
	}
}
