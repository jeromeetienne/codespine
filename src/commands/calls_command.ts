import { Command } from 'commander';
import { CommandHelpers } from './command_helpers.js';

export class CallsCommand {
	static register(program: Command): void {
		CommandHelpers.registerSymbolQuery(program, 'calls', '<id>', 'list symbols that <id> calls', (query, arg) =>
			query.calls(arg));
	}
}
