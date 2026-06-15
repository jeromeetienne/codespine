import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import { Command } from 'commander';
import { z } from 'zod';
import { CLUSTER_EDGE_WEIGHTS } from '../cluster/cluster_weights.js';
import { DEFAULT_COMMUNITY_OPTIONS } from '../cluster/community_detector.js';
import { AssignedNode, CommunitiesDump, CommunityNamer, RenamePlan } from '../cluster/community_namer.js';
import {
	CLUSTERING_MANIFEST_KEY,
	COMMUNITY_LABEL_METADATA_KEY,
	COMMUNITY_METADATA_KEY,
	ClusterReport,
	GraphClusterer,
} from '../cluster/graph_clusterer.js';
import { KuzuStore, StoredNode } from '../store/kuzu_store.js';
import { OutputFolder } from '../store/output_folder.js';
import { CommandHelpers } from './command_helpers.js';

type ClusterOptions = {
	outputFolder: string;
	resolution: string;
	json?: boolean;
};

type CommunitiesOptions = {
	outputFolder: string;
	json?: boolean;
};

type RenameOptions = {
	outputFolder: string;
	labels: string;
	json?: boolean;
};

/** A rename request file: a JSON object mapping each community index to a non-empty label. */
const RenameLabelsSchema = z.record(z.string().min(1));

export class ClusterCommand {
	static register(program: Command): void {
		const command = program
			.command('cluster')
			.description('detect code communities with the Leiden algorithm, then name them');
		ClusterCommand.registerDetect(command);
		ClusterCommand.registerCommunities(command);
		ClusterCommand.registerRename(command);
	}

	/** `cluster` / `cluster detect` — detect communities and attach metadata.community. The default subcommand. */
	private static registerDetect(parent: Command): void {
		const command = parent
			.command('detect', { isDefault: true })
			.description('detect communities with the Leiden algorithm and attach metadata.community onto nodes');
		CommandHelpers.addOutputFolderOption(command)
			.option('--resolution <n>', 'CPM resolution (higher → more, smaller communities)', String(DEFAULT_COMMUNITY_OPTIONS.resolution))
			.option('--json', 'emit the clustering report as JSON', false)
			.action(async (options: ClusterOptions) => {
				await ClusterCommand.run(options);
			});
	}

	/** `cluster communities` — the read-only dump an agent names from. */
	private static registerCommunities(parent: Command): void {
		const command = parent
			.command('communities')
			.description('list each detected community with its members, for an agent (e.g. Claude Code) to name');
		CommandHelpers.addOutputFolderOption(command)
			.option('--json', 'emit the dump as JSON', false)
			.action(async (options: CommunitiesOptions) => {
				await ClusterCommand.runCommunities(options);
			});
	}

	/** `cluster rename` — apply the labels an agent produced for the dump. */
	private static registerRename(parent: Command): void {
		const command = parent
			.command('rename')
			.description('apply community labels from a { "<index>": "<label>" } JSON file onto metadata.communityLabel');
		CommandHelpers.addOutputFolderOption(command)
			.requiredOption('--labels <file>', 'path to a JSON file mapping community index to a label')
			.option('--json', 'emit the rename result as JSON', false)
			.action(async (options: RenameOptions) => {
				await ClusterCommand.runRename(options);
			});
	}

	private static async run(options: ClusterOptions): Promise<void> {
		const resolution = Number(options.resolution);
		if (Number.isFinite(resolution) === false || resolution <= 0) {
			console.error(chalk.red(`invalid --resolution '${options.resolution}' — expected a positive number`));
			process.exitCode = 1;
			return;
		}
		const store = new KuzuStore(new OutputFolder(options.outputFolder).dbPath);
		await store.initSchema();
		try {
			const report = await GraphClusterer.cluster(store, CLUSTER_EDGE_WEIGHTS, {
				...DEFAULT_COMMUNITY_OPTIONS,
				resolution,
			});
			ClusterCommand.print(report, options.json === true);
		} finally {
			await store.close();
		}
	}

	private static async runCommunities(options: CommunitiesOptions): Promise<void> {
		const store = new KuzuStore(new OutputFolder(options.outputFolder).dbPath);
		await store.initSchema();
		try {
			const nodes = await store.readNodes();
			const dump = CommunityNamer.summarize(nodes.map(ClusterCommand.toAssigned));
			ClusterCommand.printCommunities(dump, options.json === true);
		} finally {
			await store.close();
		}
	}

	private static async runRename(options: RenameOptions): Promise<void> {
		const labels = ClusterCommand.readLabels(options.labels);
		if (labels === null) {
			process.exitCode = 1;
			return;
		}
		const store = new KuzuStore(new OutputFolder(options.outputFolder).dbPath);
		await store.initSchema();
		try {
			const nodes = await store.readNodes();
			const assigned = nodes.map(ClusterCommand.toAssigned);
			if (assigned.every((node) => node.community === undefined)) {
				console.log(chalk.yellow('! no communities found — run `cluster` first.'));
				process.exitCode = 1;
				return;
			}
			const plan = CommunityNamer.plan(assigned, labels);
			const byId = new Map(nodes.map((node) => [node.id, node]));
			const updates = plan.changes.flatMap((change) =>
				change.nodeIds.map((id) => ({
					id,
					metadata: {
						...(byId.get(id)?.metadata ?? {}),
						[COMMUNITY_LABEL_METADATA_KEY]: change.to,
					},
				})),
			);
			await store.writeNodeMetadata(updates);

			const manifest = CommunityNamer.updateManifestLabels(
				await store.readGraphMeta(CLUSTERING_MANIFEST_KEY),
				labels,
			);
			if (manifest !== null) {
				await store.writeGraphMeta(CLUSTERING_MANIFEST_KEY, manifest);
			}
			ClusterCommand.printRename(plan, updates.length, options.json === true);
		} finally {
			await store.close();
		}
	}

	/** Reads and validates the rename file into an `index → label` map, or null on any error (already reported). */
	private static readLabels(file: string): Map<number, string> | null {
		let raw: string;
		try {
			raw = readFileSync(file, 'utf8');
		} catch {
			console.error(chalk.red(`could not read labels file '${file}'`));
			return null;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			console.error(chalk.red(`labels file '${file}' is not valid JSON`));
			return null;
		}
		const result = RenameLabelsSchema.safeParse(parsed);
		if (result.success === false) {
			console.error(chalk.red('labels file must be a JSON object mapping community index to a non-empty label'));
			return null;
		}
		const labels = new Map<number, string>();
		for (const [key, label] of Object.entries(result.data)) {
			const index = Number(key);
			if (Number.isInteger(index) === false || index < 0) {
				console.error(chalk.red(`invalid community index '${key}' — expected a non-negative integer`));
				return null;
			}
			labels.set(index, label);
		}
		return labels;
	}

	/** Projects a stored node onto the fields the namer needs, decoding its community assignment from metadata. */
	private static toAssigned(node: StoredNode): AssignedNode {
		const community = node.metadata[COMMUNITY_METADATA_KEY];
		const label = node.metadata[COMMUNITY_LABEL_METADATA_KEY];
		return {
			id: node.id,
			name: node.name,
			kind: node.kind,
			filePath: node.filePath,
			community: typeof community === 'number' ? community : undefined,
			currentLabel: typeof label === 'string' ? label : undefined,
		};
	}

	private static print(report: ClusterReport, json: boolean): void {
		if (json === true) {
			console.log(JSON.stringify(report, null, 2));
			return;
		}
		if (report.nodesAssigned === 0) {
			console.log(chalk.yellow('! no weighted edges in graph — run `extract --semantic` and `load` first.'));
			return;
		}
		console.log(chalk.green(`✓ assigned ${report.nodesAssigned} node(s) to ${report.communityCount} communities`));
		console.log(`  resolution ${report.resolution}, CPM quality ${report.quality.toFixed(4)}`);
		const top = report.labels.slice(0, 8).map((label, index) => `${label} (${report.sizes[index]})`);
		console.log(`  largest communities: ${top.join(', ')}`);
	}

	private static printCommunities(dump: CommunitiesDump, json: boolean): void {
		if (json === true) {
			console.log(JSON.stringify(dump, null, 2));
			return;
		}
		if (dump.communityCount === 0) {
			console.log(chalk.yellow('! no communities found — run `cluster` first.'));
			return;
		}
		console.log(chalk.green(`${dump.communityCount} communities:`));
		for (const community of dump.communities) {
			console.log(`\n${chalk.bold(`[${community.index}]`)} ${community.currentLabel} ${chalk.gray(`(${community.size})`)}`);
			for (const member of community.members) {
				console.log(`  ${chalk.gray(member.kind.padEnd(12))} ${member.name}  ${chalk.gray(member.filePath)}`);
			}
		}
	}

	private static printRename(plan: RenamePlan, nodesUpdated: number, json: boolean): void {
		if (json === true) {
			console.log(JSON.stringify({ ...plan, nodesUpdated }, null, 2));
			return;
		}
		if (plan.unknownIndexes.length > 0) {
			console.log(chalk.yellow(`! ignored unknown community index(es): ${plan.unknownIndexes.join(', ')}`));
		}
		if (plan.changes.length === 0) {
			console.log(chalk.yellow('! nothing renamed — labels matched the current ones or no index matched.'));
			return;
		}
		console.log(chalk.green(`✓ renamed ${plan.changes.length} communities across ${nodesUpdated} node(s)`));
		for (const change of plan.changes) {
			console.log(`  ${chalk.bold(`[${change.index}]`)} ${chalk.gray(`${change.from} →`)} ${change.to}`);
		}
	}
}
