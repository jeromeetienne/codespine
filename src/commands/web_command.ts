import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';
import { KuzuStore } from '../store/kuzu_store.js';
import { DEFAULT_DB_PATH } from './command_helpers.js';

/**
 * Static assets of the web visualisation, resolved relative to this module so
 * the same path works from `src/` (tsx) and from `dist/` (published package).
 */
const WEB_ROOT = fileURLToPath(new URL('../../contribs/web_visualisation/web', import.meta.url));

const DATA_SCRIPT_PATH = '/data/graph_data.js';
const DEFAULT_PORT = '4173';

const MIME_TYPES: Record<string, string> = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
};

type WebOptions = {
	db: string;
	port: string;
};

/**
 * `web` command — serves the knowledge graph database in an interactive web
 * visualisation. The graph is read from Kùzu once at startup and injected into
 * the page as `/data/graph_data.js`; all other assets are served statically
 * from the contribs/web_visualisation/web directory.
 */
export class WebCommand {
	static register(program: Command): void {
		program
			.command('web')
			.description('serve the knowledge graph database in a web visualisation')
			.option('-d, --db <path>', 'Kùzu database path', DEFAULT_DB_PATH)
			.option('-p, --port <port>', 'HTTP port to listen on', DEFAULT_PORT)
			.action(async (options: WebOptions) => {
				await WebCommand.run(options);
			});
	}

	private static async run(options: WebOptions): Promise<void> {
		const dbPath = resolve(options.db);
		if (existsSync(dbPath) === false) {
			console.error(chalk.red(`database not found at ${dbPath} — run \`extract\` then \`load\` first`));
			process.exitCode = 1;
			return;
		}

		const dataScript = await WebCommand.buildDataScript(dbPath);

		const server = createServer((request, response) => {
			void WebCommand.handle(request, response, dataScript);
		});
		server.listen(Number(options.port), () => {
			console.log(chalk.green(`✓ serving the knowledge graph at http://localhost:${options.port}/`));
			console.log(chalk.gray('  press Ctrl+C to stop'));
		});
	}

	/**
	 * Reads every node and edge from the database and renders them as the
	 * `window.GRAPH_DATA` script the visualisation page loads on boot.
	 */
	private static async buildDataScript(dbPath: string): Promise<string> {
		const store = new KuzuStore(dbPath);
		await store.initSchema();
		try {
			const nodeRows = await store.run(
				'MATCH (n:GraphNode) RETURN n.id AS id, n.kind AS kind, n.name AS name, n.filePath AS filePath, n.exported AS exported, n.startLine AS startLine, n.endLine AS endLine',
			);
			const edgeRows = await store.run(
				'MATCH (f:GraphNode)-[e:Edge]->(t:GraphNode) RETURN f.id AS from, e.kind AS kind, t.id AS to',
			);
			const nodes = nodeRows.map((row) => ({
				id: String(row.id),
				kind: String(row.kind),
				name: String(row.name),
				filePath: String(row.filePath),
				exported: row.exported === true,
				range: {
					startLine: Number(row.startLine),
					startColumn: 0,
					endLine: Number(row.endLine),
					endColumn: 0,
				},
			}));
			const edges = edgeRows.map((row, index) => ({
				id: `e${index}`,
				kind: String(row.kind),
				from: String(row.from),
				to: String(row.to),
			}));
			console.log(chalk.cyan(`loaded ${nodes.length} nodes, ${edges.length} edges from ${dbPath}`));
			return `window.GRAPH_DATA = ${JSON.stringify({ nodes, edges })};\n`;
		} finally {
			await store.close();
		}
	}

	private static async handle(request: IncomingMessage, response: ServerResponse, dataScript: string): Promise<void> {
		const url = new URL(request.url ?? '/', 'http://localhost');
		const pathname = url.pathname === '/' ? '/index.html' : url.pathname;

		if (pathname === DATA_SCRIPT_PATH) {
			response.writeHead(200, { 'content-type': MIME_TYPES['.js'] });
			response.end(dataScript);
			return;
		}

		const filePath = normalize(join(WEB_ROOT, pathname));
		if (filePath.startsWith(WEB_ROOT + sep) === false) {
			WebCommand.notFound(response);
			return;
		}
		try {
			const content = await readFile(filePath);
			response.writeHead(200, { 'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream' });
			response.end(content);
		} catch {
			WebCommand.notFound(response);
		}
	}

	private static notFound(response: ServerResponse): void {
		response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
		response.end('not found');
	}
}
