/**
 * Containerised HTTP capacity test for sample_projects/project_04 (the Express +
 * better-sqlite3 shop API). It boots the real server as a child process, ramps a
 * concurrent HTTP load with autocannon, and reports the highest sustained request
 * rate at which p99 latency stays under the SLO — the per-box capacity number that
 * answers "how many requests can one server take before latency climbs, i.e. when
 * do I need another server?".
 *
 * REALISM track (ADR 0001 — docs/adr/0001-dockerized-workload-runner.md): when run
 * inside scripts/loadtest_docker.sh the whole process is pinned to a fixed
 * CPU/memory box, so the numbers carry scheduler noise by design and are a capacity
 * ESTIMATE, not a deterministic gate. The load client is co-located with the server
 * and hits 127.0.0.1, which avoids the macOS<->VM network-latency floor but means
 * the client shares the CPU cap with the server (documented trade-off).
 *
 * It changes exactly ONE runtime flag versus the shipped defaults: DB_PATH points
 * at a real file (not the :memory: default) so the order-write path actually
 * fsyncs. Without that, write capacity would be fictitious. No source is modified.
 *
 * Configuration is via environment variables (all optional except SERVER_ENTRY);
 * scripts/loadtest_docker.sh wires them up with sensible container defaults.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import autocannon from 'autocannon';

/** The two load shapes; reads and the fsync write path saturate very differently. */
type LoadProfile = 'read' | 'mixed';

/** Everything one capacity run needs, resolved from the environment. */
type SweepConfig = {
	url: string;
	host: string;
	port: number;
	profile: LoadProfile;
	sloP99Ms: number;
	startRate: number;
	stepRate: number;
	maxRate: number;
	stepDurationSec: number;
	warmupSec: number;
	baseConnections: number;
	products: number;
	serverEntry: string;
	serverCwd: string;
	dbPath: string;
	outDir: string | undefined;
};

/** One rung of the ramp: what we offered and what the server actually did. */
type StepResult = {
	offeredRate: number;
	achievedRps: number;
	p50Ms: number;
	p99Ms: number;
	non2xx: number;
	timeouts: number;
	errors: number;
	withinSlo: boolean;
};

/** The headline capacity verdict derived from the ramp. */
type SweepSummary = {
	rpsMax: number;
	kneeRate: number | null;
};

/** A single request template autocannon cycles through, optionally randomised. */
type AutocannonRequest = {
	method?: string;
	path?: string;
	headers?: Record<string, string>;
	body?: string;
	setupRequest?: (request: AutocannonRequest) => AutocannonRequest;
};

/** The subset of autocannon options this harness sets. */
type AutocannonOptions = {
	url: string;
	connections: number;
	duration: number;
	overallRate?: number;
	timeout?: number;
	pipelining?: number;
	requests?: AutocannonRequest[];
};

/** The subset of the autocannon result this harness reads. */
type AutocannonResult = {
	requests: { average: number; sent: number };
	latency: { p50: number; p99: number; average: number };
	non2xx: number;
	timeouts: number;
	errors: number;
};

/** autocannon's callback signature, typed locally so we need no @types dependency. */
type AutocannonFn = (
	options: AutocannonOptions,
	callback: (error: Error | null, result: AutocannonResult) => void,
) => unknown;

const runAutocannon = autocannon as unknown as AutocannonFn;

/** Search terms drawn from the seed vocabulary so the LIKE scan finds real hits. */
const SEARCH_TERMS = [
	'lamp', 'desk', 'smart', 'mini', 'classic', 'drill', 'blender',
	'tent', 'speaker', 'kettle', 'premium', 'vintage', 'deluxe', 'rugged', 'silent',
] as const;

/** Drives a ramped HTTP load against a freshly booted project_04 server. */
export class LoadtestDriver {
	/** Boots the server, ramps the load, prints and writes the capacity report. */
	static async main(): Promise<void> {
		const config = LoadtestDriver.configFromEnv();
		LoadtestDriver.removeDbFiles(config.dbPath);
		LoadtestDriver.printBanner(config);
		const server = LoadtestDriver.startServer(config);
		try {
			console.log(`booting server (${config.serverEntry}); seeding ${config.products} products may take a while under a CPU cap ...`);
			await LoadtestDriver.waitForHealth(config.url, 180_000, server.isDown);
			console.log('server healthy; warming up ...');
			await LoadtestDriver.warmup(config);
			console.log(`ramping ${config.profile} load until p99 > ${config.sloP99Ms} ms ...`);
			const steps = await LoadtestDriver.sweep(config);
			const summary = LoadtestDriver.summarize(steps);
			console.log('\n' + LoadtestDriver.formatTable(steps));
			console.log('\n' + LoadtestDriver.formatHeadline(summary, config));
			LoadtestDriver.writeReport(config, steps, summary);
		} catch (error: unknown) {
			const tail = server.stderrTail();
			if (tail.length > 0) {
				console.error('--- server stderr (tail) ---\n' + tail);
			}
			throw error;
		} finally {
			server.child.kill('SIGTERM');
			LoadtestDriver.removeDbFiles(config.dbPath);
		}
	}

	/** Resolves the run configuration from environment variables. */
	static configFromEnv(): SweepConfig {
		const serverEntry = process.env.SERVER_ENTRY;
		if (serverEntry === undefined || serverEntry === '') {
			throw new Error('SERVER_ENTRY is required (absolute path to the server entrypoint, e.g. /work/src/main.ts)');
		}
		const port = Number(process.env.PORT ?? '3000');
		const host = process.env.LOADTEST_HOST ?? '127.0.0.1';
		const profile = LoadtestDriver.parseProfile(process.env.LOADTEST_PROFILE);
		const dbPath = process.env.DB_PATH ?? join(tmpdir(), `project_04_loadtest_${process.pid}.db`);
		return {
			url: `http://${host}:${port}`,
			host,
			port,
			profile,
			sloP99Ms: Number(process.env.LOADTEST_SLO_P99_MS ?? '200'),
			startRate: Number(process.env.LOADTEST_START_RATE ?? '10'),
			stepRate: Number(process.env.LOADTEST_STEP_RATE ?? '20'),
			maxRate: Number(process.env.LOADTEST_MAX_RATE ?? '1000'),
			stepDurationSec: Number(process.env.LOADTEST_STEP_DURATION_SEC ?? '8'),
			warmupSec: Number(process.env.LOADTEST_WARMUP_SEC ?? '3'),
			baseConnections: Number(process.env.LOADTEST_BASE_CONNECTIONS ?? '16'),
			products: Number(process.env.LOADTEST_PRODUCTS ?? '20000'),
			serverEntry,
			serverCwd: process.env.SERVER_CWD ?? process.cwd(),
			dbPath,
			outDir: process.env.LOADTEST_OUT_DIR,
		};
	}

	/** Validates the profile string, defaulting to the realistic mixed read+write. */
	static parseProfile(value: string | undefined): LoadProfile {
		if (value === 'read' || value === 'mixed') {
			return value;
		}
		return 'mixed';
	}

	/** Spawns the server with tsx, capturing whether it died and its stderr tail. */
	static startServer(config: SweepConfig): { child: ChildProcess; isDown: () => boolean; stderrTail: () => string } {
		const child = spawn('node', ['--import', 'tsx', config.serverEntry], {
			cwd: config.serverCwd,
			env: { ...process.env, PORT: String(config.port), DB_PATH: config.dbPath },
			stdio: ['ignore', 'ignore', 'pipe'],
		});
		let exited = false;
		let stderr = '';
		child.on('exit', () => {
			exited = true;
		});
		if (child.stderr !== null) {
			child.stderr.setEncoding('utf8');
			child.stderr.on('data', (chunk: string) => {
				stderr = (stderr + chunk).slice(-2000);
			});
		}
		return { child, isDown: () => exited, stderrTail: () => stderr };
	}

	/** Polls GET /health until 200, failing fast if the server process dies. */
	static async waitForHealth(baseUrl: string, timeoutMs: number, isDown: () => boolean): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (isDown() === true) {
				throw new Error('server process exited before becoming healthy');
			}
			try {
				const response = await fetch(`${baseUrl}/health`);
				if (response.ok === true) {
					return;
				}
			} catch {
				// connection refused while the server is still starting; retry below.
			}
			await delay(500);
		}
		throw new Error(`server did not become healthy within ${timeoutMs} ms`);
	}

	/** A short low-rate run to warm the JIT and the page cache before measuring. */
	static async warmup(config: SweepConfig): Promise<void> {
		if (config.warmupSec <= 0) {
			return;
		}
		await new Promise<void>((resolve) => {
			runAutocannon(
				{
					url: config.url,
					connections: config.baseConnections,
					duration: config.warmupSec,
					overallRate: Math.max(5, config.startRate),
					pipelining: 1,
					requests: LoadtestDriver.buildRequests(config),
				},
				() => resolve(),
			);
		});
	}

	/** Ramps the offered rate stepwise, stopping at the first SLO breach. */
	static async sweep(config: SweepConfig): Promise<StepResult[]> {
		const steps: StepResult[] = [];
		for (let rate = config.startRate; rate <= config.maxRate; rate += config.stepRate) {
			const step = await LoadtestDriver.runStep(config, rate);
			steps.push(step);
			const verdict = step.withinSlo === true ? 'OK' : 'OVER SLO';
			console.log(
				`  offered ${String(rate).padStart(5)} rps -> achieved ${String(step.achievedRps).padStart(5)} rps  ` +
					`p50 ${step.p50Ms.toFixed(1).padStart(7)} ms  p99 ${step.p99Ms.toFixed(1).padStart(7)} ms  ` +
					`timeouts ${String(step.timeouts).padStart(4)}  ${verdict}`,
			);
			if (step.withinSlo === false) {
				break;
			}
		}
		return steps;
	}

	/** Runs one autocannon step at a fixed offered rate and grades it against the SLO. */
	static async runStep(config: SweepConfig, offeredRate: number): Promise<StepResult> {
		const sloSeconds = config.sloP99Ms / 1000;
		const connections = LoadtestDriver.clamp(Math.ceil(offeredRate * sloSeconds * 3), config.baseConnections, 512);
		const result = await new Promise<AutocannonResult>((resolve, reject) => {
			runAutocannon(
				{
					url: config.url,
					connections,
					duration: config.stepDurationSec,
					overallRate: offeredRate,
					timeout: 10,
					pipelining: 1,
					requests: LoadtestDriver.buildRequests(config),
				},
				(error, value) => {
					if (error !== null) {
						reject(error);
						return;
					}
					resolve(value);
				},
			);
		});
		const p99Ms = result.latency.p99;
		const withinSlo = p99Ms <= config.sloP99Ms && result.timeouts === 0 && result.non2xx === 0;
		return {
			offeredRate,
			achievedRps: Math.round(result.requests.average),
			p50Ms: result.latency.p50,
			p99Ms,
			non2xx: result.non2xx,
			timeouts: result.timeouts,
			errors: result.errors,
			withinSlo,
		};
	}

	/**
	 * Builds the weighted request mix. The read mix is roughly 30% product list,
	 * 40% product-by-id, 20% search, 10% stats; the mixed profile swaps one read
	 * for a POST /orders so writes are ~10% of traffic (the fsync-bound path).
	 */
	static buildRequests(config: SweepConfig): AutocannonRequest[] {
		const list: AutocannonRequest = {
			method: 'GET',
			path: '/products?page=1&pageSize=20',
			setupRequest: (request) => {
				request.path = `/products?page=${LoadtestDriver.randomInt(1, 50)}&pageSize=20`;
				return request;
			},
		};
		const byId: AutocannonRequest = {
			method: 'GET',
			path: '/products/1',
			setupRequest: (request) => {
				request.path = `/products/${LoadtestDriver.randomInt(1, config.products)}`;
				return request;
			},
		};
		const search: AutocannonRequest = {
			method: 'GET',
			path: '/search?q=lamp&limit=10',
			setupRequest: (request) => {
				const term = SEARCH_TERMS[LoadtestDriver.randomInt(0, SEARCH_TERMS.length - 1)];
				request.path = `/search?q=${term}&limit=10`;
				return request;
			},
		};
		const stats: AutocannonRequest = { method: 'GET', path: '/stats' };
		const reads = [list, list, list, byId, byId, byId, search, search, stats];
		if (config.profile === 'read') {
			return [...reads, byId];
		}
		const order: AutocannonRequest = {
			method: 'POST',
			path: '/orders',
			headers: { 'content-type': 'application/json' },
			setupRequest: (request) => {
				request.path = '/orders';
				request.headers = { 'content-type': 'application/json' };
				request.body = JSON.stringify({
					customer: `load_${LoadtestDriver.randomInt(1, 1_000_000)}`,
					items: [
						{ productId: LoadtestDriver.randomInt(1, config.products), quantity: LoadtestDriver.randomInt(1, 3) },
					],
				});
				return request;
			},
		};
		return [...reads, order];
	}

	/** Capacity = best achieved rps among in-SLO steps; knee = first breaching rate. */
	static summarize(steps: StepResult[]): SweepSummary {
		const good = steps.filter((step) => step.withinSlo === true);
		const rpsMax = good.length > 0 ? Math.max(...good.map((step) => step.achievedRps)) : 0;
		const breach = steps.find((step) => step.withinSlo === false);
		return { rpsMax, kneeRate: breach !== undefined ? breach.offeredRate : null };
	}

	/** Renders the ramp as an aligned monospace table. */
	static formatTable(steps: StepResult[]): string {
		const header = 'offered  achieved      p50       p99   non2xx  timeouts  verdict';
		const rows = steps.map((step) => {
			const verdict = step.withinSlo === true ? 'OK' : 'OVER SLO';
			return (
				`${String(step.offeredRate).padStart(7)}  ${String(step.achievedRps).padStart(8)}  ` +
				`${step.p50Ms.toFixed(1).padStart(7)}  ${step.p99Ms.toFixed(1).padStart(8)}  ` +
				`${String(step.non2xx).padStart(6)}  ${String(step.timeouts).padStart(8)}  ${verdict}`
			);
		});
		return [header, ...rows].join('\n');
	}

	/** One-line capacity verdict plus the "when to add a server" interpretation. */
	static formatHeadline(summary: SweepSummary, config: SweepConfig): string {
		const head = `CAPACITY: ~${summary.rpsMax} req/s sustained at p99 <= ${config.sloP99Ms} ms (profile=${config.profile}).`;
		if (summary.kneeRate === null) {
			return `${head}\nSLO never breached up to ${config.maxRate} offered rps — raise LOADTEST_MAX_RATE to find the knee.`;
		}
		return (
			`${head}\np99 first crosses the SLO at ~${summary.kneeRate} offered rps. ` +
			'Provision so steady-state load stays below this; cross it and you need another server.'
		);
	}

	/** Writes a machine-readable JSON report when an output directory is given. */
	static writeReport(config: SweepConfig, steps: StepResult[], summary: SweepSummary): void {
		if (config.outDir === undefined || config.outDir === '') {
			return;
		}
		mkdirSync(config.outDir, { recursive: true });
		const reportPath = join(config.outDir, `loadtest_${config.profile}.json`);
		const report = {
			generatedAt: new Date().toISOString(),
			profile: config.profile,
			sloP99Ms: config.sloP99Ms,
			products: config.products,
			summary,
			steps,
		};
		writeFileSync(reportPath, JSON.stringify(report, null, '\t') + '\n');
		console.log(`\nwrote ${reportPath}`);
	}

	/** Prints the realism-track banner so the numbers are read with the right caveats. */
	static printBanner(config: SweepConfig): void {
		console.log('Realism track: HTTP capacity test, scheduler noise included. Not a deterministic gate — see docs/adr/0001-dockerized-workload-runner.md.');
		console.log(
			`  profile=${config.profile}  slo=p99<=${config.sloP99Ms}ms  rates=${config.startRate}..${config.maxRate} step ${config.stepRate}  ` +
				`step=${config.stepDurationSec}s  db=${config.dbPath}`,
		);
		console.log('  note: the load client runs in-process against 127.0.0.1, so it shares the CPU cap with the server.');
	}

	/** Removes the SQLite file and its journal/WAL sidecars. */
	static removeDbFiles(dbPath: string): void {
		for (const suffix of ['', '-journal', '-wal', '-shm']) {
			rmSync(`${dbPath}${suffix}`, { force: true });
		}
	}

	/** Inclusive random integer in [min, max]. */
	static randomInt(min: number, max: number): number {
		return min + Math.floor(Math.random() * (max - min + 1));
	}

	/** Clamps value into [low, high]. */
	static clamp(value: number, low: number, high: number): number {
		return Math.min(Math.max(value, low), high);
	}
}

const invokedDirectly =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly === true) {
	LoadtestDriver.main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
