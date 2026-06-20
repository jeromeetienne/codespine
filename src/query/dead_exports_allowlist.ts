/**
 * Framework entry points that {@link GraphQuery.deadExports} must not report as
 * dead (#217). These exports are consumed by framework convention — a magic
 * export name, or a reference by string path in a config — rather than by an
 * `import` the extractor can resolve, so they have no inbound reference edge and
 * look unused. No purely TypeScript-level analysis can know they are live.
 *
 * One predicate per framework ({@link DeadExportsAllowlist.isNextjsEntryPoint},
 * {@link DeadExportsAllowlist.isTailwindEntryPoint},
 * {@link DeadExportsAllowlist.isPlaywrightEntryPoint}); matching is plain string
 * work on the path, no regular expressions.
 *
 * Minimising collisions. Several of these basenames are ordinary words
 * (`page`, `route`, `error`, `layout`, `middleware`), so a normal file could
 * carry one by coincidence. Four things keep false positives low:
 *  1. Directory anchoring — Next.js app-router files only count under an `app/`
 *     or `pages/` directory; `middleware` / `instrumentation` only at the project
 *     root or directly under `src/`.
 *  2. Exact config names — only `<framework>.config.<ext>` is matched, never a
 *     generic `*.config.*`, so a project's own `app.config.ts` is left alone.
 *  3. Exact, case-sensitive stems — a `Page.tsx` component or a `page.test.tsx`
 *     test does not match the `page` route convention.
 *  4. The list only ever suppresses exports that are ALREADY unreferenced. A
 *     coincidentally-named file whose exports are used never reaches the dead
 *     list, so a collision can only hide a genuinely dead export that also
 *     happens to sit in a framework-named file — a narrow intersection.
 */

const SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([
	'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts',
]);

/** Next.js app-router special files whose default (and convention-named) exports are entry points. */
const NEXTJS_APP_ROUTER_STEMS: ReadonlySet<string> = new Set([
	'page', 'layout', 'loading', 'error', 'not-found', 'global-error',
	'template', 'default', 'route', 'sitemap', 'robots', 'manifest',
	'opengraph-image', 'twitter-image', 'icon', 'apple-icon',
]);

/** Directories under which Next.js routes live; an app-router basename only counts inside one of them. */
const NEXTJS_ROUTE_DIRECTORIES: ReadonlySet<string> = new Set(['app', 'pages']);

function pathSegments(filePath: string): string[] {
	return filePath.split('\\').join('/').split('/').filter((segment) => segment.length > 0);
}

function basenameOf(filePath: string): string {
	const segments = pathSegments(filePath);
	return segments.length === 0 ? '' : segments[segments.length - 1];
}

function isScript(basename: string): boolean {
	const dot = basename.lastIndexOf('.');
	return dot !== -1 && SCRIPT_EXTENSIONS.has(basename.slice(dot + 1));
}

/** The basename with its final extension removed: `page.tsx` → `page`, `tailwind.config.ts` → `tailwind.config`. */
function stemOf(basename: string): string {
	const dot = basename.lastIndexOf('.');
	return dot === -1 ? basename : basename.slice(0, dot);
}

/** Whether `basename` is `<framework>.config.<script-extension>`, e.g. `tailwind.config.ts`. */
function isConfigFor(basename: string, framework: string): boolean {
	return isScript(basename) === true && stemOf(basename) === framework + '.config';
}

/** Whether the file sits at the project root or directly under `src/`, where Next.js requires `middleware` / `instrumentation`. */
function isRootOrSrc(filePath: string): boolean {
	const segments = pathSegments(filePath);
	if (segments.length === 1) {
		return true;
	}
	return segments.length === 2 && segments[0] === 'src';
}

/** Whether any directory segment (everything before the basename) is one of `directories`. */
function hasDirectory(filePath: string, directories: ReadonlySet<string>): boolean {
	return pathSegments(filePath).slice(0, -1).some((segment) => directories.has(segment));
}

export class DeadExportsAllowlist {
	/** Whether every export of `filePath` is a framework entry point and should be excluded from the dead-exports report. */
	static isFrameworkEntryPoint(filePath: string): boolean {
		return DeadExportsAllowlist.isNextjsEntryPoint(filePath) === true
			|| DeadExportsAllowlist.isTailwindEntryPoint(filePath) === true
			|| DeadExportsAllowlist.isPlaywrightEntryPoint(filePath) === true;
	}

	/**
	 * Next.js: `next.config.*`; a root or `src/` `middleware` / `instrumentation`;
	 * and app-router files (`page`, `layout`, `route`, `sitemap`, …) under an
	 * `app/` or `pages/` directory.
	 */
	static isNextjsEntryPoint(filePath: string): boolean {
		const basename = basenameOf(filePath);
		if (isConfigFor(basename, 'next') === true) {
			return true;
		}
		if (isScript(basename) === false) {
			return false;
		}
		const stem = stemOf(basename);
		if (stem === 'middleware' || stem === 'instrumentation') {
			return isRootOrSrc(filePath);
		}
		if (NEXTJS_APP_ROUTER_STEMS.has(stem) === true) {
			return hasDirectory(filePath, NEXTJS_ROUTE_DIRECTORIES);
		}
		return false;
	}

	/** Tailwind: `tailwind.config.*`. */
	static isTailwindEntryPoint(filePath: string): boolean {
		return isConfigFor(basenameOf(filePath), 'tailwind');
	}

	/**
	 * Playwright: `playwright.config.*`, and `global-setup` / `global-teardown`
	 * (referenced by path from the config, so matched in any directory). The
	 * `global-setup` / `global-teardown` convention is shared with Jest.
	 */
	static isPlaywrightEntryPoint(filePath: string): boolean {
		const basename = basenameOf(filePath);
		if (isConfigFor(basename, 'playwright') === true) {
			return true;
		}
		if (isScript(basename) === false) {
			return false;
		}
		const stem = stemOf(basename);
		return stem === 'global-setup' || stem === 'global-teardown';
	}
}
