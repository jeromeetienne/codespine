import { notFound } from 'next/navigation';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { useMDXComponents as getMDXComponents } from '../../mdx-components';

export const generateStaticParams = generateStaticParamsFor('mdxPath');

type PageProps = {
	params: Promise<{ mdxPath?: string[] }>;
};

function isAssetRequest(mdxPath: string[] | undefined): boolean {
	if (mdxPath === undefined) return false;
	return mdxPath.some((segment) => segment.includes('.'));
}

export async function generateMetadata(props: PageProps) {
	const params = await props.params;
	if (isAssetRequest(params.mdxPath) === true) notFound();
	const { metadata } = await importPage(params.mdxPath);
	return metadata;
}

const Wrapper = getMDXComponents({}).wrapper;

export default async function Page(props: PageProps) {
	const params = await props.params;
	if (isAssetRequest(params.mdxPath) === true) notFound();
	const result = await importPage(params.mdxPath);
	const { default: MDXContent, toc, metadata, sourceCode } = result;
	return (
		<Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
			<MDXContent {...props} params={params} />
		</Wrapper>
	);
}
