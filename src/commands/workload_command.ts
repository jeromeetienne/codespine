import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { EnrichReport, RuntimeEnricher } from '../enrich/runtime_enricher.js';
import { PROJECT_ROOT } from '../project_root.js';
import { KuzuStore } from '../store/kuzu_store.js';
import { OutputFolder } from '../store/output_folder.js';
import { CommandHelpers } from './command_helpers.js';
import { WorkloadPlan } from './workload_plan.js';

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
	project?: string;
	image: string;
	json?: boolean;
};

type WorkloadScaffoldOptions = {
	outputFolder: string;
	kind: string;
	force?: boolean;
};

const KINDS = ['cpu-profile', 'loadtest'];
const SCAFFOLD_KINDS = ['cpu-profile', 'loadtest', 'both'];
const TEMPLATES_DIR = join(PROJECT_ROOT, 'dotclaude_folder', 'skills', 'codespine-workload', 'templates');

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
			.option('--project <dir>', 'project root mounted read-only at /work for --docker; the driver must be inside it', process.cwd())
			.option('--image <tag>', 'runner image tag for --docker (built from <output>/workload/Dockerfile)', 'codespine-workload-runner')
			.option('--json', 'emit the report as JSON', false)
			.action(async (options: WorkloadRunOptions) => {
				if (KINDS.includes(options.kind) === false) {
					console.error(chalk.red(`unknown kind '${options.kind}' — choose one of: ${KINDS.join(', ')}`));
					process.exitCode = 1;
					return;
				}
				await WorkloadCommand.run(options);
			});

		const scaffold = workload
			.command('scaffold')
			.description('write driver + Dockerfile templates into <output>/workload/ to fill in and run');
		CommandHelpers.addOutputFolderOption(scaffold)
			.option('--kind <kind>', `which driver(s) to scaffold: ${SCAFFOLD_KINDS.join(', ')}`, 'cpu-profile')
			.option('--force', 'overwrite existing files', false)
			.action(async (options: WorkloadScaffoldOptions) => {
				if (SCAFFOLD_KINDS.includes(options.kind) === false) {
					console.error(chalk.red(`unknown kind '${options.kind}' — choose one of: ${SCAFFOLD_KINDS.join(', ')}`));
					process.exitCode = 1;
					return;
				}
				await WorkloadCommand.scaffold(options);
			});
	}

	private static async run(options: WorkloadRunOptions): Promise<void> {
		if (options.kind === 'loadtest') {
			console.error(
				chalk.yellow(
					'kind=loadtest is not wired into the CLI yet — run the loadtest driver directly via the ' +
					'codespine-workload skill template (or scripts/loadtest_docker.sh for the sample projects). ' +
					'cpu-profile is supported.',
				),
			);
			process.exitCode = 1;
			return;
		}
		await WorkloadCommand.runCpuProfile(options);
	}

	/** Profile the driver (host or under a container cap), enrich the graph, and report. */
	private static async runCpuProfile(options: WorkloadRunOptions): Promise<void> {
		const driver = resolve(options.driver);
		const hostRoot = resolve(options.root);
		const profileDir = await mkdtemp(join(tmpdir(), 'codespine-workload-'));
		try {
			let profilePath: string;
			let enrichRoot: string;
			if (options.docker === true) {
				const project = resolve(options.project ?? process.cwd());
				profilePath = await WorkloadCommand.profileInDocker(driver, profileDir, project, options);
				enrichRoot = WorkloadPlan.inContainerPath(project, hostRoot);
			} else {
				profilePath = await WorkloadCommand.profileOnHost(driver, profileDir);
				enrichRoot = hostRoot;
			}
			const profileText = await readFile(profilePath, 'utf8');
			const store = new KuzuStore(new OutputFolder(options.outputFolder).dbPath);
			await store.initSchema();
			try {
				const report = await RuntimeEnricher.enrich(store, profileText, { root: enrichRoot });
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

	/** Profile the driver inside a container under the cgroup cap; the profile lands on the host via the /prof mount. */
	private static async profileInDocker(driver: string, profileDir: string, project: string, options: WorkloadRunOptions): Promise<string> {
		const cli = process.env.CONTAINER_CLI ?? 'docker';
		const rel = WorkloadPlan.driverRelative(project, driver);
		const contextDir = join(resolve(options.outputFolder), 'workload');
		if ((await WorkloadCommand.exists(join(contextDir, 'Dockerfile'))) === false) {
			throw new Error(`no Dockerfile at ${contextDir} — run \`codespine workload scaffold\` first`);
		}
		await WorkloadCommand.ensureImage(cli, options.image, contextDir);
		const capFlags: string[] = [];
		if (options.cpus !== undefined) {
			capFlags.push('--cpus', options.cpus);
		}
		if (options.memory !== undefined) {
			capFlags.push('--memory', options.memory, '--memory-swap', options.memory);
		}
		if (capFlags.length === 0) {
			console.error(chalk.yellow('warning: --docker without --cpus/--memory runs uncapped — add a cap for the realistic "one box".'));
		}
		console.error(chalk.gray(`profiling under ${cli} (${capFlags.join(' ') || 'uncapped'}) ...`));
		const args = [
			'run', '--rm', ...capFlags,
			'-v', `${project}:/work:ro`, '-v', `${profileDir}:/prof`, '-w', '/opt/runner',
			options.image,
			'node', '--cpu-prof', '--cpu-prof-dir', '/prof', '--import', 'tsx', `/work/${rel}`,
		];
		await WorkloadCommand.spawnInherit(cli, args);
		return WorkloadCommand.newestProfile(profileDir);
	}

	/** Build the runner image from the scaffolded Dockerfile if it is not already present. */
	private static async ensureImage(cli: string, image: string, contextDir: string): Promise<void> {
		if ((await WorkloadCommand.tryRun(cli, ['image', 'inspect', image])) === true) {
			return;
		}
		console.error(chalk.gray(`building runner image ${image} (one-time) ...`));
		await WorkloadCommand.spawnInherit(cli, ['build', '-t', image, contextDir]);
	}

	private static tryRun(cli: string, args: string[]): Promise<boolean> {
		return new Promise((resolvePromise) => {
			const child = spawn(cli, args, { stdio: 'ignore' });
			child.on('error', () => resolvePromise(false));
			child.on('close', (code) => resolvePromise(code === 0));
		});
	}

	private static spawnInherit(cli: string, args: string[]): Promise<void> {
		return new Promise((resolvePromise, reject) => {
			const child = spawn(cli, args, { stdio: ['ignore', 'inherit', 'inherit'] });
			child.on('error', reject);
			child.on('close', (code) => {
				if (code === 0) {
					resolvePromise();
					return;
				}
				reject(new Error(`${cli} ${args[0]} exited with code ${code}`));
			});
		});
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

	/** Copy driver + Dockerfile templates into <output>/workload/ for the user/agent to fill in. */
	private static async scaffold(options: WorkloadScaffoldOptions): Promise<void> {
		const targetDir = join(resolve(options.outputFolder), 'workload');
		await mkdir(targetDir, { recursive: true });
		const files = WorkloadPlan.scaffoldFiles(options.kind);
		const wantCpu = options.kind === 'cpu-profile' || options.kind === 'both';
		const wantLoad = options.kind === 'loadtest' || options.kind === 'both';
		for (const file of files) {
			await WorkloadCommand.copyTemplate(join(TEMPLATES_DIR, file.src), join(targetDir, file.dest), options.force === true);
		}
		WorkloadCommand.printScaffoldNext(targetDir, wantCpu, wantLoad);
	}

	private static async copyTemplate(source: string, dest: string, force: boolean): Promise<void> {
		if (force === false && (await WorkloadCommand.exists(dest)) === true) {
			console.log(chalk.gray(`  skip (exists): ${dest}`));
			return;
		}
		await copyFile(source, dest);
		console.log(chalk.green(`  wrote ${dest}`));
	}

	private static async exists(path: string): Promise<boolean> {
		try {
			await stat(path);
			return true;
		} catch {
			return false;
		}
	}

	private static printScaffoldNext(targetDir: string, wantCpu: boolean, wantLoad: boolean): void {
		console.log(chalk.bold('\nNext: fill the `// EDIT FOR YOUR PROJECT` block, then run:'));
		if (wantCpu === true) {
			console.log(`  ${chalk.cyan(`codespine workload run --driver ${join(targetDir, 'cpu_profile_driver.ts')} --root <extract-root>`)}`);
		}
		if (wantLoad === true) {
			console.log(
				`  ${chalk.cyan(`SERVER_ENTRY=src/main.ts node --import tsx ${join(targetDir, 'loadtest_driver.ts')}`)}` +
				`  ${chalk.gray('(host; see the codespine-workload skill for the docker cap)')}`,
			);
		}
	}
}
