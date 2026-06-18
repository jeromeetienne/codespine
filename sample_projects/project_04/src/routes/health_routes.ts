import type { Request, Response } from 'express';

/** Express handler for the readiness probe. */
export class HealthRoutes {
	/** `GET /health` — trivial readiness check; the cheap control endpoint. */
	static check(_request: Request, response: Response): void {
		response.json({ status: 'ok' });
	}
}
