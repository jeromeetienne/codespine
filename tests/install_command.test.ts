import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { InstallCommand } from '../src/commands/install_command.js';
import { PROJECT_ROOT } from '../src/project_root.js';

const SOURCE_ROOT = resolve(PROJECT_ROOT, 'dotclaude_folder');
const COMMAND_OPTIMIZE = join('commands', 'code-graph-optimize.md');
const COMMAND_INTERVIEW = join('commands', 'code-graph-interview.md');
const SKILL_QUERY = join('skills', 'code-graph-query', 'SKILL.md');

const tempDirs: string[] = [];

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir !== undefined) {
			rmSync(dir, { recursive: true, force: true });
		}
	}
});

/** A throwaway target directory, cleaned up after each test. */
function makeTarget(): string {
	const dir = mkdtempSync(join(tmpdir(), 'tkg-install-'));
	tempDirs.push(dir);
	return join(dir, '.claude');
}

describe('InstallCommand.mirror', () => {
	it('installs every bundled command and skill, preserving the tree', () => {
		const targetRoot = makeTarget();
		const result = InstallCommand.mirror(SOURCE_ROOT, targetRoot, false);

		assert.ok(result.installed.includes(COMMAND_OPTIMIZE));
		assert.ok(result.installed.includes(COMMAND_INTERVIEW));
		assert.ok(result.installed.includes(SKILL_QUERY));
		assert.deepEqual(result.skipped, []);

		assert.equal(
			readFileSync(join(targetRoot, SKILL_QUERY), 'utf8'),
			readFileSync(join(SOURCE_ROOT, SKILL_QUERY), 'utf8'),
		);
	});

	it('skips files that already exist unless force is set', () => {
		const targetRoot = makeTarget();
		const existing = join(targetRoot, SKILL_QUERY);
		mkdirSync(dirname(existing), { recursive: true });
		writeFileSync(existing, 'SENTINEL');

		const firstRun = InstallCommand.mirror(SOURCE_ROOT, targetRoot, false);
		assert.ok(firstRun.skipped.includes(SKILL_QUERY));
		assert.ok(firstRun.installed.includes(COMMAND_OPTIMIZE));
		assert.equal(readFileSync(existing, 'utf8'), 'SENTINEL');

		const forcedRun = InstallCommand.mirror(SOURCE_ROOT, targetRoot, true);
		assert.ok(forcedRun.installed.includes(SKILL_QUERY));
		assert.deepEqual(forcedRun.skipped, []);
		assert.notEqual(readFileSync(existing, 'utf8'), 'SENTINEL');
	});
});
