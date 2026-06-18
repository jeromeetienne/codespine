import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express } from 'express';
import type { Database } from './db/database.js';
import { HealthRoutes } from './routes/health_routes.js';
import { OrdersRoutes } from './routes/orders_routes.js';
import { ProductsRoutes } from './routes/products_routes.js';
import { SearchRoutes } from './routes/search_routes.js';
import { StatsRoutes } from './routes/stats_routes.js';

/**
 * Absolute path to the static assets directory, resolved relative to this source
 * file so it is independent of the working directory. It holds the OpenAPI spec
 * (`openapi.yaml`) and the standalone API console (`index.html`).
 */
const PUBLIC_DIRECTORY = fileURLToPath(new URL('../public/', import.meta.url));

/** Builds the Express application and registers the routes. */
export class App {
	/**
	 * Creates the app, stores the database on `app.locals` so the handlers can reach
	 * it, and registers the five endpoints plus the health probe. Handlers are named
	 * static methods so each route yields an `Endpoint` node and a `HANDLES` edge.
	 *
	 * It also serves the `public/` directory (the OpenAPI spec at `/openapi.yaml` and
	 * the standalone API console at `/`) with `express.static`. That is middleware, not
	 * a verb route, so the endpoint extractor does not count it: the graph still has
	 * exactly the six API endpoints registered below.
	 */
	static create(database: Database): Express {
		const app = express();
		app.locals.database = database;
		app.use(express.json());
		app.get('/products', ProductsRoutes.list);
		app.get('/products/:id', ProductsRoutes.getById);
		app.get('/search', SearchRoutes.search);
		app.post('/orders', OrdersRoutes.create);
		app.get('/stats', StatsRoutes.summary);
		app.get('/health', HealthRoutes.check);
		app.use(express.static(PUBLIC_DIRECTORY));
		return app;
	}
}
