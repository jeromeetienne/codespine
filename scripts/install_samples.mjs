import { existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Installs the dependencies of every sample project under `sample_projects/`.
 *
 * Wired as the root `postinstall` hook so that a plain `npm install` at the
 * repository root also provisions each sample project. A sample project's
 * `node_modules` is gitignored and therefore absent from a fresh checkout or a
 * fresh `git worktree`, which otherwise breaks the root typecheck (it transitively
 * compiles `sample_projects/project_04` via the project_04 workload test).
 *
 * The published package does not ship `sample_projects/`, so the hook is a no-op
 * when the directory is absent — this keeps `npm install codespine` working for
 * consumers.
 */
class InstallSamples {
	/** Run `npm install` in each sample project that declares a package.json. */
	static run() {
		const base = 'sample_projects';
		if (existsSync(base) === false) return;

		for (const name of readdirSync(base)) {
			const dir = `${base}/${name}`;
			if (existsSync(`${dir}/package.json`) === false) continue;
			execSync('npm install', { cwd: dir, stdio: 'inherit' });
		}
	}
}

InstallSamples.run();
