import type { ReactNode } from 'react';

const BASE_PATH = process.env.GITHUB_ACTIONS === 'true' ? '/ts_knowledge_graph' : '';

export const metadata = {
	title: 'ts-knowledge-graph docs',
	icons: { icon: `${BASE_PATH}/icon.svg` },
};

/**
 * Minimal second root layout (via the `(redirect)` route group) for the bare `/`
 * route. The localized docs live under the `(docs)/[lang]` root layout; keeping the
 * redirect in its own root layout lets `/` resolve as a real route in `next dev`
 * while the docs keep their per-locale `<html lang>`.
 */
export default function RedirectRootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
