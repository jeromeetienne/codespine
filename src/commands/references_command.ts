import { Command } from 'commander';
import { OutputFolder } from '../store/output_folder.js';
import { CommandHelpers, QueryOptions } from './command_helpers.js';

export class ReferencesCommand {
	static register(program: Command): void {
		const command = program
			.command('references')
			.description('list everything that references <id> (calls, type usage, heritage, new)')
			.argument('<id>', 'node id to inspect');
		CommandHelpers.addOutputFolderOption(command)
			.option('--json', 'emit raw JSON', false)
			.action(async (id: string, options: QueryOptions) => {
				await CommandHelpers.withQuery(new OutputFolder(options.outputFolder), async (query) => {
					CommandHelpers.printNeighbors(await query.references(id), options.json === true);
				});
			});
	}
}
