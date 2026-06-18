import { App } from './app.js';
import { Settings } from './config/settings.js';
import { Database } from './db/database.js';
import { Seed } from './db/seed.js';

/**
 * Boots the server: load settings, open and seed the database, then listen. This
 * non-exported entry point roots the call graph through the app and the services.
 */
function main(): void {
	const settings = Settings.load();
	const database = new Database(settings);
	Seed.run(database);
	const app = App.create(database);
	const port = Number(process.env.PORT ?? '3000');
	app.listen(port, () => {
		console.log(`shop-sqlite listening on http://localhost:${port} (db=${settings.path})`);
	});
}

main();
