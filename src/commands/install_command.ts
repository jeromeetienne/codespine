import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';

const SKILL_RELATIVE_PATH = 'skills/ts-knowledge-graph/SKILL.md';

type InstallOptions = {
	force: boolean;
};

/**
 * Installs the bundled Claude Code skill into a target project so an agent can
 * query the knowledge graph through the ts-knowledge-graph CLI.
 */
export class InstallCommand {
	static register(program: Command): void {
		program
			.command('install')
			.description('install the ts-knowledge-graph Claude Code skill into a project')
			.argument('[destFolder]', 'project root to install the skill into', process.cwd())
			.option('--force', 'overwrite an existing SKILL.md', false)
			.action(async (destFolder: string, options: InstallOptions) => {
				await InstallCommand.run(destFolder, options);
			});
	}

	private static async run(destFolder: string, options: InstallOptions): Promise<void> {
		const source = InstallCommand.sourceSkillPath();
		const target = resolve(destFolder, SKILL_RELATIVE_PATH);

		if (existsSync(target) === true && options.force === false) {
			console.log(chalk.yellow(`✗ ${target} already exists — pass --force to overwrite`));
			return;
		}

		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(source, target);
		console.log(chalk.green(`✓ installed skill -> ${target}`));
	}

	/**
	 * Resolves the bundled SKILL.md relative to this module. The `../../` prefix
	 * reaches the package root from both `src/commands` (run via tsx) and
	 * `dist/commands` (run from the built output).
	 */
	private static sourceSkillPath(): string {
		const here = dirname(fileURLToPath(import.meta.url));
		return resolve(here, '..', '..', SKILL_RELATIVE_PATH);
	}
}
