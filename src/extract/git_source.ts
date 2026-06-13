import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SourceManifest } from '../schema/source_manifest.js';

const execFileAsync = promisify(execFile);

/**
 * Resolves the Git provenance of an analysed project — its GitHub repository, the
 * commit being parsed, and the project root's path within the repository — so the
 * graph can later link each file to its exact source on GitHub.
 */
export class GitSource {
	/**
	 * Detects the GitHub repository, HEAD commit, and in-repo path prefix for `dir`.
	 * Returns `undefined` when `dir` is not a Git work tree, has no GitHub `origin`
	 * remote, or Git is unavailable.
	 */
	static async detect(dir: string): Promise<SourceManifest | undefined> {
		const git = async (...args: string[]): Promise<string | undefined> => {
			try {
				const { stdout } = await execFileAsync('git', ['-C', dir, ...args]);
				return stdout.trim();
			} catch {
				return undefined;
			}
		};

		if (await git('rev-parse', '--is-inside-work-tree') !== 'true') {
			return undefined;
		}
		const remoteUrl = await git('remote', 'get-url', 'origin');
		const commit = await git('rev-parse', 'HEAD');
		const baseUrl = remoteUrl === undefined ? undefined : GitSource.githubBaseUrl(remoteUrl);
		if (baseUrl === undefined || commit === undefined) {
			return undefined;
		}
		return { baseUrl, commit, prefix: await git('rev-parse', '--show-prefix') ?? '' };
	}

	/**
	 * Normalises a Git `origin` URL to its GitHub web base
	 * (`https://<host>/<owner>/<repo>`), or `undefined` for non-GitHub remotes.
	 * Handles the SCP-like (`git@host:owner/repo.git`), `https://`, `git://`, and
	 * `ssh://` forms, with or without a trailing `.git`. The host is kept as-is so
	 * GitHub Enterprise remotes resolve to their own domain.
	 */
	static githubBaseUrl(remoteUrl: string): string | undefined {
		const trimmed = remoteUrl.trim();
		let host: string;
		let path: string;
		if (trimmed.includes('://') === true) {
			try {
				const parsed = new URL(trimmed);
				host = parsed.host;
				path = parsed.pathname;
			} catch {
				return undefined;
			}
		} else {
			const scpMatch = trimmed.match(/^[^@]+@([^:]+):(.+)$/);
			if (scpMatch === null) {
				return undefined;
			}
			host = scpMatch[1];
			path = scpMatch[2];
		}
		if (host.toLowerCase().includes('github') === false) {
			return undefined;
		}
		const segments = path.replace(/\.git$/, '').split('/').filter((segment) => segment.length > 0);
		if (segments.length < 2) {
			return undefined;
		}
		return `https://${host}/${segments[0]}/${segments[1]}`;
	}
}
