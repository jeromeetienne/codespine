import { useMDXComponents as getDocsMDXComponents } from 'nextra-theme-docs';
import type { UseMDXComponents } from 'nextra/mdx-components';
import { LocaleLink } from './components/locale-link';

/**
 * Theme MDX components with a locale-aware anchor so in-content links resolve
 * within the active locale under the static-export i18n layout. See
 * {@link LocaleLink} for why this override is required.
 */
const docsComponents = getDocsMDXComponents({
	a: LocaleLink,
});

export const useMDXComponents: UseMDXComponents<typeof docsComponents> = <T,>(
	components?: T,
) => ({
	...docsComponents,
	...components,
});
