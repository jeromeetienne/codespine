import type { ReactNode } from 'react';
import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import { Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import 'nextra-theme-docs/style.css';

export const metadata = {
	title: 'ts-knowledge-graph docs',
	description: 'Operator documentation for ts-knowledge-graph — parse TypeScript into a knowledge graph and query it for static analysis.',
};

const navbar = (
	<Navbar
		logo={<strong>ts-knowledge-graph</strong>}
		projectLink="https://github.com/jeromeetienne/ts_knowledge_graph"
	/>
);

const footer = <Footer>MIT {new Date().getFullYear()} © ts-knowledge-graph</Footer>;

export default async function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" dir="ltr" suppressHydrationWarning>
			<Head />
			<body>
				<Layout
					navbar={navbar}
					footer={footer}
					pageMap={await getPageMap()}
					docsRepositoryBase="https://github.com/jeromeetienne/ts_knowledge_graph/tree/main/contribs/docsite"
				>
					{children}
				</Layout>
			</body>
		</html>
	);
}
