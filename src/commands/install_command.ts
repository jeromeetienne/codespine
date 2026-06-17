import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { PROJECT_ROOT } from '../project_root.js';

const SOURCE_DIR = 'dotclaude_folder';

type InstallOptions = {
	force: boolean;
};

/** Outcome of mirroring the bundled assets, as relative paths under `.claude/`. */
export type InstallResult = {
	installed: string[];
	skipped: string[];
};

/**
 * Installs the bundled Claude Code assets — every slash command and skill under
 * `dotclaude_folder/` — into a target project's `.claude/` directory, so an agent
 * can drive the knowledge graph through the ts-knowledge-graph CLI.
 */
export class InstallCommand {
	static register(program: Command): void {
		program
			.command('install')
			.description('install the ts-knowledge-graph Claude Code commands and skills into a project')
			.argument('[destFolder]', "the '.claude' directory to install into", '.')
			.option('--force', 'overwrite files that already exist', false)
			.action((destFolder: string, options: InstallOptions) => {
				InstallCommand.run(destFolder, options);
			});
	}

	private static run(destFolder: string, options: InstallOptions): void {
		const sourceRoot = resolve(PROJECT_ROOT, SOURCE_DIR);
		if (existsSync(sourceRoot) === false) {
			console.log(chalk.red(`✗ bundled assets not found at ${sourceRoot}`));
			return;
		}

		const targetRoot = InstallCommand.resolveTargetRoot(destFolder);
		const result = InstallCommand.mirror(sourceRoot, targetRoot, options.force);

		for (const rel of result.installed) {
			console.log(chalk.green(`✓ ${rel}`));
		}
		for (const rel of result.skipped) {
			console.log(chalk.yellow(`✗ skip (exists): ${rel}`));
		}

		const summary = `installed ${result.installed.length} file(s) into ${targetRoot}`;
		const hint = result.skipped.length > 0 ? `, skipped ${result.skipped.length} (pass --force to overwrite)` : '';
		console.log(chalk.bold(`\n${summary}${hint}`));
	}

	/**
	 * Resolves the destination directory from the `destFolder` argument. The
	 * argument *is* the `.claude` directory — assets are written straight into
	 * it, with nothing appended — so this only normalises it to an absolute path
	 * against the current working directory.
	 */
	static resolveTargetRoot(destFolder: string): string {
		return resolve(destFolder);
	}

	/**
	 * Copies every file under `sourceRoot` into `targetRoot`, preserving the
	 * relative tree (so `commands/` and `skills/` land where Claude Code reads
	 * them). Existing files are left untouched unless `force` is true. Returns the
	 * relative paths that were written and those that were skipped.
	 */
	static mirror(sourceRoot: string, targetRoot: string, force: boolean): InstallResult {
		const installed: string[] = [];
		const skipped: string[] = [];

		for (const source of InstallCommand.collectFiles(sourceRoot)) {
			const rel = relative(sourceRoot, source);
			const target = join(targetRoot, rel);

			if (existsSync(target) === true && force === false) {
				skipped.push(rel);
				continue;
			}

			mkdirSync(dirname(target), { recursive: true });
			copyFileSync(source, target);
			installed.push(rel);
		}

		return { installed, skipped };
	}

	/** Recursively collects every file path under a directory, depth-first. */
	private static collectFiles(dir: string): string[] {
		const files: string[] = [];
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory() === true) {
				files.push(...InstallCommand.collectFiles(full));
				continue;
			}
			if (entry.isFile() === true) {
				files.push(full);
			}
		}
		return files;
	}
}
