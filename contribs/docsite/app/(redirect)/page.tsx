'use client';

import { useEffect } from 'react';

/**
 * Redirects the bare root (`/`) to the default locale. Static export cannot run
 * middleware, so this replaces it: a `<meta refresh>` covers no-JS and crawler
 * cases, and the client redirect covers everything else. The target is relative so
 * it resolves correctly both at the local root (`/`) and under the GitHub Pages
 * basePath (`/ts_knowledge_graph/`).
 */
export default function RootRedirect() {
	useEffect(() => {
		window.location.replace('./en/' + window.location.hash);
	}, []);
	return (
		<>
			<meta httpEquiv="refresh" content="0; url=./en/" />
			<p style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
				Redirecting to <a href="./en/">the documentation</a>…
			</p>
		</>
	);
}
