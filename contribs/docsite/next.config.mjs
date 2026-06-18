import nextra from 'nextra';

const withNextra = nextra({
	// Prefix every page-map link with the active locale at build time. This is the
	// static-export-friendly alternative to Nextra's i18n middleware, which cannot
	// run under `output: 'export'`.
	unstable_shouldAddLocaleToLinks: true,
});

// Apply the GitHub Pages basePath only when building inside GitHub Actions
// (the runner always sets GITHUB_ACTIONS=true). Local `next build` / `next dev`
// then produce a root-relative site, so `npm run start` (serve ./out) works at
// http://localhost:3000 without the /codespine prefix breaking assets.
const basePath = process.env.GITHUB_ACTIONS === 'true' ? '/codespine' : '';

export default withNextra({
	output: 'export',
	basePath,
	images: { unoptimized: true },
	trailingSlash: true,
	// Nextra reads `i18n`, bakes the locale list into build-time env, then unsets it
	// so the App Router (which has no built-in `i18n` option) does not reject it.
	i18n: {
		locales: ['en', 'fr'],
		defaultLocale: 'en',
	},
});
