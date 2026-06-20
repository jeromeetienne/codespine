/**
 * Framework entry points that {@link GraphQuery.deadExports} must not report as
 * dead (#217). These exports are consumed by framework convention — a magic
 * export name, or a reference by string path in a config — rather than by an
 * `import` the extractor can resolve, so they have no inbound reference edge and
 * look unused. No purely TypeScript-level analysis can know they are live.
 *
 * The allowlist matches by file path: a dedicated framework file (a config, a
 * Next.js `middleware`, a Playwright `global-setup`, a Next.js app-router file)
 * has all of its exports treated as graph roots. Matching the whole file rather
 * than specific export names keeps the list robust — a default-exported page
 * component, for instance, keeps its own declared name in the graph, so there is
 * no stable export name to match on.
 */

/** Dedicated framework files identified by basename alone, wherever they sit. */
const ENTRY_FILE_BASENAME = /^(middleware|instrumentation|global-setup|global-teardown)\.[mc]?[jt]sx?$/;

/** A config module: `next.config.mjs`, `tailwind.config.ts`, `playwright.config.ts`, `vite.config.ts`, `jest.config.js`, … */
const CONFIG_FILE_BASENAME = /\.config\.[mc]?[jt]sx?$/;

/** Next.js app-router special files, whose default (and convention-named) exports are entry points. */
const APP_ROUTER_BASENAME = /^(page|layout|loading|error|not-found|global-error|template|default|route|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.[jt]sx?$/;

/** App-router files only count under an `app/` or `pages/` directory, so a stray `page.tsx` elsewhere is not exempted. */
const APP_ROUTER_DIR = /(^|\/)(app|pages)\//;

export class DeadExportsAllowlist {
	/**
	 * Whether every export of `filePath` is a framework entry point and should be
	 * excluded from the dead-exports report. `filePath` is the graph-relative path
	 * stored on a node (for example `middleware.ts`, `src/app/page.tsx`).
	 */
	static isFrameworkEntryPoint(filePath: string): boolean {
		const path = filePath.replace(/\\/g, '/');
		const basename = path.slice(path.lastIndexOf('/') + 1);
		if (ENTRY_FILE_BASENAME.test(basename) === true) {
			return true;
		}
		if (CONFIG_FILE_BASENAME.test(basename) === true) {
			return true;
		}
		return APP_ROUTER_DIR.test(path) === true && APP_ROUTER_BASENAME.test(basename) === true;
	}
}
