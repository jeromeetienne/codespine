'use client';

import type { ComponentProps } from 'react';
import { usePathname } from 'next/navigation';
import { Anchor } from 'nextra/components';

const LOCALES: ReadonlySet<string> = new Set(['en', 'fr']);

/**
 * Resolves the active locale from the current pathname, defaulting to `'en'`.
 *
 * Under the static-export i18n layout every route is `/<locale>/...`, so the
 * locale is always the first path segment (e.g. `/fr/commands/find` → `fr`).
 */
function localeFromPathname(pathname: string): string {
	const segment = pathname.split('/')[1];
	return LOCALES.has(segment) === true ? segment : 'en';
}

/**
 * MDX anchor that prefixes the active locale onto root-absolute in-content links.
 *
 * Nextra's `unstable_shouldAddLocaleToLinks` only rewrites page-map links (sidebar,
 * navbar, breadcrumbs) — not links authored inside MDX bodies. Without this, a link
 * like `[find](/commands/find)` resolves to `/commands/find`, which no longer exists
 * once every page lives under `/<locale>/`. Anchors that are external, hash-only,
 * relative, or already locale-prefixed are passed through to Nextra's `Anchor`
 * untouched.
 */
export function LocaleLink({ href, ...props }: ComponentProps<typeof Anchor>) {
	const pathname = usePathname();
	if (typeof href !== 'string' || href.startsWith('/') === false) {
		return <Anchor href={href} {...props} />;
	}
	const firstSegment = href.split('/')[1];
	if (LOCALES.has(firstSegment) === true) {
		return <Anchor href={href} {...props} />;
	}
	return <Anchor href={`/${localeFromPathname(pathname)}${href}`} {...props} />;
}
