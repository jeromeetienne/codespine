import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Project } from 'ts-morph';
import { GraphBuilder } from '../src/extract/graph_builder.js';
import { DeadExportsAllowlist } from '../src/query/dead_exports_allowlist.js';
import { GraphQuery } from '../src/query/graph_query.js';
import { KuzuStore } from '../src/store/kuzu_store.js';

describe('DeadExportsAllowlist.isFrameworkEntryPoint', () => {
	const exempt = [
		'middleware.ts',
		'src/middleware.ts',
		'middleware.js',
		'instrumentation.ts',
		'tailwind.config.ts',
		'next.config.mjs',
		'playwright.config.ts',
		'e2e/global-setup.ts',
		'global-teardown.ts',
		'app/page.tsx',
		'src/app/dashboard/layout.tsx',
		'app/api/users/route.ts',
		'app/sitemap.ts',
	];
	for (const path of exempt) {
		it(`exempts ${path}`, () => {
			assert.equal(DeadExportsAllowlist.isFrameworkEntryPoint(path), true);
		});
	}

	const reported = [
		'src/utils/helper.ts',
		'src/config.ts',
		'src/configuration.ts',
		'components/Page.tsx',
		'app/components/Button.tsx',
		'src/middleware/index.ts',
		'lib/route.ts',
		'app/page.test.tsx',
		// collision mitigation: a framework basename in the wrong place is not exempt
		'lib/middleware.ts',
		'apps/web/src/feature/middleware.ts',
		// outside the covered frameworks (Next.js / Tailwind / Playwright)
		'vite.config.ts',
		'jest.config.js',
	];
	for (const path of reported) {
		it(`does not exempt ${path}`, () => {
			assert.equal(DeadExportsAllowlist.isFrameworkEntryPoint(path), false);
		});
	}
});

describe('DeadExportsAllowlist per-framework predicates', () => {
	it('isNextjsEntryPoint matches only Next.js files', () => {
		assert.equal(DeadExportsAllowlist.isNextjsEntryPoint('middleware.ts'), true);
		assert.equal(DeadExportsAllowlist.isNextjsEntryPoint('app/page.tsx'), true);
		assert.equal(DeadExportsAllowlist.isNextjsEntryPoint('next.config.ts'), true);
		assert.equal(DeadExportsAllowlist.isNextjsEntryPoint('tailwind.config.ts'), false);
	});

	it('isTailwindEntryPoint matches only tailwind.config', () => {
		assert.equal(DeadExportsAllowlist.isTailwindEntryPoint('tailwind.config.ts'), true);
		assert.equal(DeadExportsAllowlist.isTailwindEntryPoint('next.config.ts'), false);
	});

	it('isPlaywrightEntryPoint matches its config and global setup', () => {
		assert.equal(DeadExportsAllowlist.isPlaywrightEntryPoint('playwright.config.ts'), true);
		assert.equal(DeadExportsAllowlist.isPlaywrightEntryPoint('e2e/global-setup.ts'), true);
		assert.equal(DeadExportsAllowlist.isPlaywrightEntryPoint('middleware.ts'), false);
	});
});

describe('dead-exports excludes framework entry points (#217)', () => {
	let dir: string;
	let store: KuzuStore;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'tkg-allowlist-'));
		store = new KuzuStore(join(dir, 'graph.kuzu'));
		await store.initSchema();
	});

	afterEach(async () => {
		await store.close();
		await rm(dir, { recursive: true, force: true });
	});

	it('hides unreferenced framework exports but still reports a normal dead export', async () => {
		const project = new Project({ useInMemoryFileSystem: true });
		project.createSourceFile('middleware.ts', 'export function middleware(): void {}');
		project.createSourceFile('tailwind.config.ts', 'export const config = { content: [] };');
		project.createSourceFile('app/page.tsx', 'export default function Page() { return null; }');
		project.createSourceFile('src/util.ts', 'export function deadUtil(): void {}');
		const builder = new GraphBuilder();
		builder.build(project, '/', { semantic: true });
		await store.load(builder.getNodes(), builder.getEdges());

		const names = (await new GraphQuery(store).deadExports()).map((ref) => ref.name);
		assert.equal(names.includes('deadUtil'), true);
		assert.equal(names.includes('middleware'), false);
		assert.equal(names.includes('config'), false);
		assert.equal(names.includes('Page'), false);
	});
});
