import { Command } from 'commander';
import { OutputFolder } from '../store/output_folder.js';
import { CommandHelpers, QueryOptions } from './command_helpers.js';

type BlastOptions = QueryOptions & {
	depth: string;
};

export class BlastRadiusCommand {
	static register(program: Command): void {
		const command = program
			.command('blast-radius')
			.description('list every symbol transitively impacted by changing <id>')
			.argument('<id>', 'node id to analyse');
		CommandHelpers.addOutputFolderOption(command)
			.option('--depth <n>', 'maximum traversal depth (clamped to 1–30)', '10')
			.option('--json', 'emit raw JSON', false)
			.action(async (id: string, options: BlastOptions) => {
				await CommandHelpers.withQuery(new OutputFolder(options.outputFolder), async (query) => {
					CommandHelpers.printRefs(await query.blastRadius(id, Number(options.depth)), options.json === true);
				});
			});
	}
}
