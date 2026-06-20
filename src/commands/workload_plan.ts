import { relative } from 'node:path';

/** A template file to copy during `workload scaffold`: source name → destination name. */
export type ScaffoldFile = { src: string; dest: string };

/**
 * Pure decisions behind the `workload` command — path mapping for the `--docker`
 * mount and the scaffold file set. Kept separate from the command's I/O (spawn,
 * filesystem, enrich) so this logic is unit-tested without a container or a profile.
 */
export class WorkloadPlan {
	/**
	 * Map a host path under `project` to its path inside the `/work` bind mount.
	 * The project root maps to `/work`; a path outside the project is an error.
	 */
	static inContainerPath(project: string, hostPath: string): string {
		const rel = relative(project, hostPath);
		if (rel === '') {
			return '/work';
		}
		if (rel.startsWith('..') === true) {
			throw new Error(`path ${hostPath} is outside the mounted project ${project}`);
		}
		return `/work/${WorkloadPlan.toPosix(rel)}`;
	}

	/**
	 * The driver's path relative to the mounted project (posix), or throw when the
	 * driver is outside the project — its imports would not resolve under `/work`.
	 */
	static driverRelative(project: string, driver: string): string {
		const rel = relative(project, driver);
		if (rel.startsWith('..') === true) {
			throw new Error(`driver ${driver} must be inside the mounted project ${project}`);
		}
		return WorkloadPlan.toPosix(rel);
	}

	/** Which template files `scaffold` writes for a given kind. The Dockerfile is always included. */
	static scaffoldFiles(kind: string): ScaffoldFile[] {
		const files: ScaffoldFile[] = [{ src: 'Dockerfile', dest: 'Dockerfile' }];
		if (kind === 'cpu-profile' || kind === 'both') {
			files.push({ src: 'cpu_profile_driver.template.ts', dest: 'cpu_profile_driver.ts' });
		}
		if (kind === 'loadtest' || kind === 'both') {
			files.push({ src: 'loadtest_driver.template.ts', dest: 'loadtest_driver.ts' });
		}
		return files;
	}

	private static toPosix(path: string): string {
		return path.split('\\').join('/');
	}
}
