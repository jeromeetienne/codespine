import nextra from 'nextra';

const withNextra = nextra({});

export default withNextra({
	output: 'export',
	basePath: process.env.NODE_ENV === 'production' ? '/ts_knowledge_graph' : '',
	images: { unoptimized: true },
	trailingSlash: true,
});
