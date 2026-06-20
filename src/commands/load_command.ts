import chalk from 'chalk';
import { Command } from 'commander';
import { RUNTIME_MANIFEST_KEY } from '../schema/runtime_manifest.js';
import { SOURCE_MANIFEST_KEY } from '../schema/source_manifest.js';
import { JsonlReader } from '../store/jsonl_reader.js';
import { KuzuStore } from '../store/kuzu_store.js';
import { OutputFolder } from '../store/output_folder.js';
import { CommandHelpers } from './command_helpers.js';

export class LoadCommand {
	static register(program: Command): void {
		const command = program
			.command('load')
			.description('load a JSONL graph into an embedded Kùzu database');
		CommandHelpers.addOutputFolderOption(command)
			.action(async (options: { outputFolder: string }) => {
				await LoadCommand.run(new OutputFolder(options.outputFolder));
			});
	}

	private static async run(folder: OutputFolder): Promise<void> {
		console.log(chalk.cyan(`Loading ${folder.graphDir} into ${folder.dbPath} ...`));
		const { nodes, edges, source } = await JsonlReader.read(folder.graphDir);
		const store = new KuzuStore(folder.dbPath);
		await store.initSchema();
		const loaded = await store.load(nodes, edges);
		if (source === undefined) {
			await store.clearGraphMeta(SOURCE_MANIFEST_KEY);
		} else {
			await store.writeGraphMeta(SOURCE_MANIFEST_KEY, source);
		}
		await store.clearGraphMeta(RUNTIME_MANIFEST_KEY);
		await store.close();
		const dropped = edges.length - loaded.edges;
		const droppedNote = dropped > 0 ? chalk.yellow(` (${dropped} dangling edges skipped)`) : '';
		console.log(chalk.green(`✓ loaded ${loaded.nodes} nodes, ${loaded.edges} edges`) + droppedNote);
	}
}
