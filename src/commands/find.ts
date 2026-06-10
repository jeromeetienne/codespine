import { Command } from 'commander';
import { CommandHelpers } from './command-helpers.js';

export class Find {
	static register(program: Command): void {
		CommandHelpers.registerSymbolQuery(program, 'find', '<pattern>', 'find symbols whose name contains <pattern>', (query, arg) =>
			query.find(arg));
	}
}
