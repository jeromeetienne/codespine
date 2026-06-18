import type { ReactNode } from 'react';
import { Footer, LastUpdated, Layout, LocaleSwitch, Navbar } from 'nextra-theme-docs';
import { Head, Search } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import 'nextra-theme-docs/style.css';

type Locale = 'en' | 'fr';

type LayoutParams = {
	lang: Locale;
};

type LayoutMetadata = {
	title: string;
	description: string;
};

const METADATA_BY_LOCALE: Record<Locale, LayoutMetadata> = {
	en: {
		title: 'codespine docs',
		description: 'Operator documentation for codespine — parse TypeScript into a knowledge graph and query it for static analysis.',
	},
	fr: {
		title: 'Documentation codespine',
		description: 'Documentation opérateur de codespine — transformez du TypeScript en graphe de connaissances et interrogez-le pour l\'analyse statique.',
	},
};

/** Theme UI strings (everything outside the MDX content) localized per locale. */
type ChromeStrings = {
	editLink: string;
	feedbackContent: string;
	tocTitle: string;
	backToTop: string;
	lastUpdated: string;
	theme: { light: string; dark: string; system: string };
	search: { placeholder: string; emptyResult: string; loading: string; errorText: string };
};

const CHROME_BY_LOCALE: Record<Locale, ChromeStrings> = {
	en: {
		editLink: 'Edit this page',
		feedbackContent: 'Question? Give us feedback',
		tocTitle: 'On This Page',
		backToTop: 'Scroll to top',
		lastUpdated: 'Last updated on',
		theme: { light: 'Light', dark: 'Dark', system: 'System' },
		search: {
			placeholder: 'Search documentation…',
			emptyResult: 'No results found.',
			loading: 'Loading…',
			errorText: 'Failed to load search index.',
		},
	},
	fr: {
		editLink: 'Modifier cette page',
		feedbackContent: 'Une question ? Faites-nous part de vos commentaires',
		tocTitle: 'Sur cette page',
		backToTop: 'Revenir en haut',
		lastUpdated: 'Dernière mise à jour le',
		theme: { light: 'Clair', dark: 'Sombre', system: 'Système' },
		search: {
			placeholder: 'Rechercher dans la documentation…',
			emptyResult: 'Aucun résultat trouvé.',
			loading: 'Chargement…',
			errorText: 'Échec du chargement de l\'index de recherche.',
		},
	},
};

const LOCALES: ReadonlyArray<{ locale: Locale; name: string }> = [
	{ locale: 'en', name: 'English' },
	{ locale: 'fr', name: 'Français' },
];

const BASE_PATH = process.env.GITHUB_ACTIONS === 'true' ? '/codespine' : '';

export async function generateMetadata({ params }: { params: Promise<LayoutParams> }) {
	const { lang } = await params;
	const meta = METADATA_BY_LOCALE[lang] ?? METADATA_BY_LOCALE.en;
	return { ...meta, icons: { icon: `${BASE_PATH}/icon.svg` } };
}

const navbar = (
	<Navbar
		logo={<strong>codespine</strong>}
		projectLink="https://github.com/jeromeetienne/codespine"
	>
		<a
			href={`${BASE_PATH}/webview_01/`}
			target="_blank"
			rel="noreferrer"
			title="Open the interactive graph demo in a new tab"
			style={{ fontSize: '0.9rem', fontWeight: 500, whiteSpace: 'nowrap' }}
		>
			Live demo
		</a>
		<LocaleSwitch lite />
	</Navbar>
);

const footer = <Footer>MIT {new Date().getFullYear()} © codespine</Footer>;

export default async function RootLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<LayoutParams>;
}) {
	const { lang } = await params;
	const chrome = CHROME_BY_LOCALE[lang] ?? CHROME_BY_LOCALE.en;
	return (
		<html lang={lang} dir="ltr" suppressHydrationWarning>
			<Head />
			<body>
				<Layout
					navbar={navbar}
					footer={footer}
					pageMap={await getPageMap('/' + lang)}
					i18n={[...LOCALES]}
					docsRepositoryBase="https://github.com/jeromeetienne/codespine/tree/main/contribs/docsite"
					editLink={chrome.editLink}
					feedback={{ content: chrome.feedbackContent }}
					toc={{ title: chrome.tocTitle, backToTop: chrome.backToTop }}
					themeSwitch={chrome.theme}
					lastUpdated={<LastUpdated>{chrome.lastUpdated}</LastUpdated>}
					search={
						<Search
							placeholder={chrome.search.placeholder}
							emptyResult={chrome.search.emptyResult}
							loading={chrome.search.loading}
							errorText={chrome.search.errorText}
						/>
					}
				>
					{children}
				</Layout>
			</body>
		</html>
	);
}
