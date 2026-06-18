import type { Request, Response } from 'express';
import type { Database } from '../db/database.js';
import { StatsService } from '../services/stats_service.js';

/** Express handler for the sales summary. */
export class StatsRoutes {
	/** `GET /stats` — per-category sales summary. */
	static summary(request: Request, response: Response): void {
		const database = request.app.locals.database as Database;
		response.json(StatsService.summary(database));
	}
}
