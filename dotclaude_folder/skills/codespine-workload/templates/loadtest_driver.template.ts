// loadtest workload driver (copy to ./.codespine/workload/loadtest_driver.ts).
//
// Boots your server as a child process, ramps a concurrent HTTP load with
// autocannon, and reports the highest sustained request rate at which p99 latency
// stays under the SLO — the per-box capacity that answers "how many requests can
// one server take before latency climbs, i.e. when do I need another server?".
//
// Run on the host (uncapped baseline):
//   SERVER_ENTRY=src/main.ts PORT=3000 DB_PATH=/tmp/app.loadtest.db \
//     LOADTEST_PROFILE=mixed LOADTEST_SLO_P99_MS=200 \
//     node --import tsx .codespine/workload/loadtest_driver.ts
//
// Run under a cap (realistic "one server" box) — see the skill's Mode B section.
//
// REALISM track: under a cap these numbers carry scheduler noise by design — a
// capacity ESTIMATE, not a deterministic gate. The load client runs in-process
// against 127.0.0.1 (avoids the host<->VM network floor; shares the CPU cap).
// Use a FILE-backed datastore for any write profile, or fsync is a no-op and write
// capacity is fictitious.
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import autocannon from 'autocannon';

type LoadProfile = 'read' | 'mixed';

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
	serverEntry: string;
	serverCwd: string;
	dbPath: string;
	outDir: string | undefined;
};

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

type SweepSummary = { rpsMax: number; kneeRate: number | null };

type AutocannonRequest = {
	method?: string;
	path?: string;
	headers?: Record<string, string>;
	body?: string;
	setupRequest?: (request: AutocannonRequest) => AutocannonRequest;
};

type AutocannonOptions = {
	url: string;
	connections: number;
	duration: number;
	overallRate?: number;
	timeout?: number;
	pipelining?: number;
	requests?: AutocannonRequest[];
};

type AutocannonResult = {
	requests: { average: number };
	latency: { p50: number; p99: number };
	non2xx: number;
	timeouts: number;
	errors: number;
};

type AutocannonFn = (
	options: AutocannonOptions,
	callback: (error: Error | null, result: AutocannonResult) => void,
) => unknown;

const runAutocannon = autocannon as unknown as AutocannonFn;

function randomInt(min: number, max: number): number {
	return min + Math.floor(Math.random() * (max - min + 1));
}

// ============================================================================
// EDIT FOR YOUR PROJECT — these three things describe your server.
// ============================================================================

// (1) Readiness probe path — must return 2xx once the server is ready to serve.
const READINESS_PATH = '/health';

// (2) How to start the server. Default runs a tsx-compatible entry from SERVER_ENTRY.
//     For a built/JS server, replace the argv (e.g. ['node','dist/main.js']).
function startServer(config: SweepConfig): ChildProcess {
	return spawn('node', ['--import', 'tsx', config.serverEntry], {
		cwd: config.serverCwd,
		env: { ...process.env, PORT: String(config.port), DB_PATH: config.dbPath },
		stdio: ['ignore', 'ignore', 'pipe'],
	});
}

// (3) The request mix. Repeat an entry to weight it; randomize per call in
//     setupRequest. The example below is a typical REST API — replace the paths,
//     ids, and the POST body with your endpoints.
const DOMAIN_SIZE = Number(process.env.LOADTEST_DOMAIN_SIZE ?? '1000');
const SEARCH_TERMS = ['lamp', 'desk', 'smart', 'mini', 'classic'];

function buildRequests(profile: LoadProfile): AutocannonRequest[] {
	const list: AutocannonRequest = {
		method: 'GET',
		path: '/items?page=1&pageSize=20',
		setupRequest: (request) => {
			request.path = `/items?page=${randomInt(1, 50)}&pageSize=20`;
			return request;
		},
	};
	const byId: AutocannonRequest = {
		method: 'GET',
		path: '/items/1',
		setupRequest: (request) => {
			request.path = `/items/${randomInt(1, DOMAIN_SIZE)}`;
			return request;
		},
	};
	const search: AutocannonRequest = {
		method: 'GET',
		path: '/search?q=lamp',
		setupRequest: (request) => {
			request.path = `/search?q=${SEARCH_TERMS[randomInt(0, SEARCH_TERMS.length - 1)]}&limit=10`;
			return request;
		},
	};
	const reads = [list, list, list, byId, byId, byId, search, search, byId]; // 9 reads
	if (profile === 'read') {
		return [...reads, byId];
	}
	const write: AutocannonRequest = {
		method: 'POST',
		path: '/items',
		headers: { 'content-type': 'application/json' },
		setupRequest: (request) => {
			request.headers = { 'content-type': 'application/json' };
			request.body = JSON.stringify({ name: `load_${randomInt(1, 1_000_000)}`, quantity: randomInt(1, 3) });
			return request;
		},
	};
	return [...reads, write]; // 9 reads + ~10% writes
}

// ============================================================================
// GENERIC MACHINERY BELOW — usually no need to edit.
// ============================================================================

export class LoadtestDriver {
	static async main(): Promise<void> {
		const config = LoadtestDriver.configFromEnv();
		LoadtestDriver.removeDbFiles(config.dbPath);
		LoadtestDriver.printBanner(config);
		const server = LoadtestDriver.launchServer(config);
		try {
			console.log(`booting server (${config.serverEntry}) ...`);
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

	static configFromEnv(): SweepConfig {
		const serverEntry = process.env.SERVER_ENTRY;
		if (serverEntry === undefined || serverEntry === '') {
			throw new Error('SERVER_ENTRY is required (path to the server entrypoint)');
		}
		const port = Number(process.env.PORT ?? '3000');
		const host = process.env.LOADTEST_HOST ?? '127.0.0.1';
		return {
			url: `http://${host}:${port}`,
			host,
			port,
			profile: process.env.LOADTEST_PROFILE === 'read' ? 'read' : 'mixed',
			sloP99Ms: Number(process.env.LOADTEST_SLO_P99_MS ?? '200'),
			startRate: Number(process.env.LOADTEST_START_RATE ?? '10'),
			stepRate: Number(process.env.LOADTEST_STEP_RATE ?? '20'),
			maxRate: Number(process.env.LOADTEST_MAX_RATE ?? '1000'),
			stepDurationSec: Number(process.env.LOADTEST_STEP_DURATION_SEC ?? '8'),
			warmupSec: Number(process.env.LOADTEST_WARMUP_SEC ?? '3'),
			baseConnections: Number(process.env.LOADTEST_BASE_CONNECTIONS ?? '16'),
			serverEntry,
			serverCwd: process.env.SERVER_CWD ?? process.cwd(),
			dbPath: process.env.DB_PATH ?? join(tmpdir(), `loadtest_${process.pid}.db`),
			outDir: process.env.LOADTEST_OUT_DIR,
		};
	}

	static launchServer(config: SweepConfig): { child: ChildProcess; isDown: () => boolean; stderrTail: () => string } {
		const child = startServer(config);
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

	static async waitForHealth(baseUrl: string, timeoutMs: number, isDown: () => boolean): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			if (isDown() === true) {
				throw new Error('server process exited before becoming healthy');
			}
			try {
				const response = await fetch(`${baseUrl}${READINESS_PATH}`);
				if (response.ok === true) {
					return;
				}
			} catch {
				// not up yet; retry below.
			}
			await delay(500);
		}
		throw new Error(`server did not become healthy within ${timeoutMs} ms`);
	}

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
					requests: buildRequests(config.profile),
				},
				() => resolve(),
			);
		});
	}

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
					requests: buildRequests(config.profile),
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

	static summarize(steps: StepResult[]): SweepSummary {
		const good = steps.filter((step) => step.withinSlo === true);
		const rpsMax = good.length > 0 ? Math.max(...good.map((step) => step.achievedRps)) : 0;
		const breach = steps.find((step) => step.withinSlo === false);
		return { rpsMax, kneeRate: breach !== undefined ? breach.offeredRate : null };
	}

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

	static writeReport(config: SweepConfig, steps: StepResult[], summary: SweepSummary): void {
		if (config.outDir === undefined || config.outDir === '') {
			return;
		}
		mkdirSync(config.outDir, { recursive: true });
		const reportPath = join(config.outDir, `loadtest_${config.profile}.json`);
		writeFileSync(reportPath, JSON.stringify({ profile: config.profile, sloP99Ms: config.sloP99Ms, summary, steps }, null, '\t') + '\n');
		console.log(`\nwrote ${reportPath}`);
	}

	static printBanner(config: SweepConfig): void {
		console.log('Realism track: HTTP capacity test, scheduler noise included. Not a deterministic gate.');
		console.log(
			`  profile=${config.profile}  slo=p99<=${config.sloP99Ms}ms  rates=${config.startRate}..${config.maxRate} step ${config.stepRate}  ` +
				`step=${config.stepDurationSec}s  db=${config.dbPath}`,
		);
	}

	static removeDbFiles(dbPath: string): void {
		for (const suffix of ['', '-journal', '-wal', '-shm']) {
			rmSync(`${dbPath}${suffix}`, { force: true });
		}
	}

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
