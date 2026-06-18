import chalk from 'chalk';
import { Command } from 'commander';
import { GraphQuery, NeighborRef, SymbolRef } from '../query/graph_query.js';
import { KuzuStore } from '../store/kuzu_store.js';
import { OutputFolder } from '../store/output_folder.js';

export const DEFAULT_OUTPUT_FOLDER = './.codespine';

export type QueryOptions = {
	outputFolder: string;
	json?: boolean;
};

export class CommandHelpers {
	/**
	 * Register the shared `-o, --output-folder` option — the single source of
	 * every output path. Returns the command so callers can keep chaining.
	 */
	static addOutputFolderOption(command: Command): Command {
		return command.option(
			'-o, --output-folder <dir>',
			'output folder holding graph/, graph.kuzu, prof/, bench/',
			DEFAULT_OUTPUT_FOLDER,
		);
	}

	static registerSymbolQuery(
		program: Command,
		name: string,
		argSpec: string,
		description: string,
		run: (query: GraphQuery, arg: string) => Promise<SymbolRef[]>,
	): void {
		const command = program.command(argSpec === '' ? name : `${name} ${argSpec}`).description(description);
		CommandHelpers.addOutputFolderOption(command)
			.option('--json', 'emit raw JSON', false)
			.action(async (...args: unknown[]) => {
				const options = args[args.length - 2] as QueryOptions;
				const arg = argSpec === '' ? '' : (args[0] as string);
				await CommandHelpers.withQuery(new OutputFolder(options.outputFolder), async (query) => {
					CommandHelpers.printRefs(await run(query, arg), options.json === true);
				});
			});
	}

	static async withQuery(folder: OutputFolder, fn: (query: GraphQuery) => Promise<void>): Promise<void> {
		const store = new KuzuStore(folder.dbPath);
		await store.initSchema();
		try {
			await fn(new GraphQuery(store));
		} finally {
			await store.close();
		}
	}

	static printRefs(refs: SymbolRef[], json: boolean): void {
		if (json === true) {
			console.log(JSON.stringify(refs, null, 2));
			return;
		}
		if (refs.length === 0) {
			console.log(chalk.yellow('(no results)'));
			return;
		}
		for (const ref of refs) {
			console.log(`${chalk.gray(ref.kind.padEnd(14))} ${chalk.bold(ref.name)}  ${chalk.gray(`${ref.filePath}:${ref.startLine}`)}`);
		}
		console.log(chalk.gray(`\n${refs.length} result(s)`));
	}

	static printNeighbors(neighbors: NeighborRef[], json: boolean): void {
		if (json === true) {
			console.log(JSON.stringify(neighbors, null, 2));
			return;
		}
		if (neighbors.length === 0) {
			console.log(chalk.yellow('(no neighbours)'));
			return;
		}
		for (const neighbor of neighbors) {
			const arrow = neighbor.direction === 'out' ? '->' : '<-';
			console.log(`${chalk.cyan(arrow)} ${chalk.gray(neighbor.edgeKind.padEnd(12))} ${chalk.bold(neighbor.name)}  ${chalk.gray(`${neighbor.filePath}:${neighbor.startLine}`)}`);
		}
		console.log(chalk.gray(`\n${neighbors.length} edge(s)`));
	}
}
