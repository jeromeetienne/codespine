import { Command } from 'commander';
import { OutputFolder } from '../store/output_folder.js';
import { CommandHelpers, QueryOptions } from './command_helpers.js';

export class NeighborsCommand {
	static register(program: Command): void {
		const command = program
			.command('neighbors')
			.description('show the one-hop neighbourhood of <id>')
			.argument('<id>', 'node id to inspect');
		CommandHelpers.addOutputFolderOption(command)
			.option('--json', 'emit raw JSON', false)
			.action(async (id: string, options: QueryOptions) => {
				await CommandHelpers.withQuery(new OutputFolder(options.outputFolder), async (query) => {
					CommandHelpers.printNeighbors(await query.neighborhood(id), options.json === true);
				});
			});
	}
}
