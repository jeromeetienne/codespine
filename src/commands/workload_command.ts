import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { EnrichReport, RuntimeEnricher } from '../enrich/runtime_enricher.js';
import { KuzuStore } from '../store/kuzu_store.js';
import { OutputFolder } from '../store/output_folder.js';
import { CommandHelpers } from './command_helpers.js';

/**
 * Run a workload in a controlled environment and attribute the cost with the graph
 * — the generalized, any-project form of the repo's `profile_and_enrich*` scripts.
 *
 * Two kinds: `cpu-profile` (loop the hot path under `node --cpu-prof`, then `enrich`
 * the graph and report where the time goes) and `loadtest` (ramp a running server).
 * Two environments: the host (uncapped baseline) or a container under an enforced
 * `--cpus`/`--memory` cap (the realism track — a faithful "one server" box).
 *
 * This MVP wires the `cpu-profile` kind on the host. The container environment and
 * the `loadtest` kind are driven for now by the codespine-workload skill and the
 * committed `scripts/loadtest_*`/`profile_and_enrich_docker.sh` runners; they are
 * being promoted into this command next.
 */
type WorkloadRunOptions = {
	outputFolder: string;
	driver: string;
	kind: string;
	root: string;
	docker?: boolean;
	cpus?: string;
	memory?: string;
	json?: boolean;
};

const KINDS = ['cpu-profile', 'loadtest'];

export class WorkloadCommand {
	static register(program: Command): void {
		const workload = program
			.command('workload')
			.description('run a workload in a controlled environment and attribute the cost with the graph');

		const run = workload
			.command('run')
			.description('profile a workload (cpu-profile) or ramp a server (loadtest), on the host or under a container cap')
			.requiredOption('--driver <path>', 'workload driver (.ts/.js): a cpu-profile loop or a loadtest server-ramp');
		CommandHelpers.addOutputFolderOption(run)
			.option('--kind <kind>', `workload kind: ${KINDS.join(', ')}`, 'cpu-profile')
			.option('-r, --root <path>', 'extract root the profile frame paths resolve against (cpu-profile enrich)', process.cwd())
			.option('--docker', 'run under an enforced container cap (realism); default is the host (uncapped)', false)
			.option('--cpus <n>', 'CPU cap for --docker, e.g. 0.5')
			.option('--memory <size>', 'memory cap for --docker, e.g. 512m')
			.option('--json', 'emit the report as JSON', false)
			.action(async (options: WorkloadRunOptions) => {
				if (KINDS.includes(options.kind) === false) {
					console.error(chalk.red(`unknown kind '${options.kind}' — choose one of: ${KINDS.join(', ')}`));
					process.exitCode = 1;
					return;
				}
				await WorkloadCommand.run(options);
			});
	}

	private static async run(options: WorkloadRunOptions): Promise<void> {
		if (options.kind === 'loadtest') {
			console.error(
				chalk.yellow(
					'kind=loadtest is not wired into the CLI yet — run the loadtest driver directly via the ' +
					'codespine-workload skill template (or scripts/loadtest_docker.sh for the sample projects). ' +
					'cpu-profile is supported below.',
				),
			);
			process.exitCode = 1;
			return;
		}
		if (options.docker === true) {
			console.error(
				chalk.yellow(
					'the --docker environment is not wired into the CLI yet — use the codespine-workload skill\'s ' +
					'docker recipe, or scripts/profile_and_enrich_docker.sh for the sample projects. ' +
					'Re-run without --docker for the host profile.',
				),
			);
			process.exitCode = 1;
			return;
		}
		await WorkloadCommand.runCpuProfileOnHost(options);
	}

	/** Profile the driver on the host under `node --cpu-prof`, enrich the graph, and report. */
	private static async runCpuProfileOnHost(options: WorkloadRunOptions): Promise<void> {
		const driver = resolve(options.driver);
		const root = resolve(options.root);
		const profileDir = await mkdtemp(join(tmpdir(), 'codespine-workload-'));
		try {
			const profilePath = await WorkloadCommand.profileOnHost(driver, profileDir);
			const profileText = await readFile(profilePath, 'utf8');
			const store = new KuzuStore(new OutputFolder(options.outputFolder).dbPath);
			await store.initSchema();
			try {
				const report = await RuntimeEnricher.enrich(store, profileText, { root });
				WorkloadCommand.printEnrich(report, options.json === true);
			} finally {
				await store.close();
			}
		} finally {
			await rm(profileDir, { recursive: true, force: true });
		}
	}

	/** Spawn `node --cpu-prof --import tsx <driver>` from the current directory; resolve the newest profile. */
	private static profileOnHost(driver: string, profileDir: string): Promise<string> {
		return new Promise((resolvePromise, reject) => {
			const args = ['--cpu-prof', '--cpu-prof-dir', profileDir, '--import', 'tsx', driver];
			const child = spawn('node', args, { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe'] });
			let stderr = '';
			child.stderr.on('data', (chunk: Buffer) => {
				stderr += chunk.toString();
			});
			child.on('error', reject);
			child.on('close', (code) => {
				if (code !== 0) {
					reject(new Error(`workload driver "${driver}" exited with code ${code}\n${stderr.trim()}`));
					return;
				}
				WorkloadCommand.newestProfile(profileDir).then(resolvePromise, reject);
			});
		});
	}

	private static async newestProfile(profileDir: string): Promise<string> {
		const entries = (await readdir(profileDir)).filter((name) => name.endsWith('.cpuprofile'));
		if (entries.length === 0) {
			throw new Error(`no .cpuprofile written to ${profileDir} — did the driver run under --cpu-prof?`);
		}
		const withMtime = await Promise.all(
			entries.map(async (name) => {
				const path = join(profileDir, name);
				return { path, mtimeMs: (await stat(path)).mtimeMs };
			}),
		);
		withMtime.sort((left, right) => right.mtimeMs - left.mtimeMs);
		return withMtime[0].path;
	}

	/** Print the enrichment report — same shape as the `enrich` command. */
	private static printEnrich(report: EnrichReport, json: boolean): void {
		if (json === true) {
			console.log(JSON.stringify(report, null, 2));
			return;
		}
		const coverage = report.totalSamples > 0 ? Math.round((report.matchedSamples / report.totalSamples) * 100) : 0;
		console.log(chalk.green(`✓ enriched ${report.matchedNodes} node(s) with metadata.runtime`));
		console.log(
			`  attributed ${chalk.bold(report.matchedSamples)} / ${report.totalSamples} samples (${coverage}%), ` +
			`${chalk.bold(`${report.matchedSelfMs} ms`)} self time`,
		);
		console.log(`  dropped ${chalk.bold(report.droppedFrames)} frame(s), ${report.droppedSamples} sample(s) — not in graph`);
		if (report.hotspots.length > 0) {
			console.log(chalk.bold('\nTop self time'));
			for (const hotspot of report.hotspots.slice(0, 10)) {
				console.log(
					`  ${chalk.gray(`${hotspot.selfMs} ms`.padStart(10))}  ${chalk.bold(hotspot.name)} ` +
					`${chalk.gray(`(${hotspot.samples} samples)`)}  ${chalk.gray(hotspot.filePath)}`,
				);
			}
		}
		console.log(chalk.gray('\nNext: `codespine hotspots --by self-time` and `codespine cost` for the ranked views.'));
	}
}
