# ts-knowledge-graph docsite

The operator documentation site for [`ts-knowledge-graph`](https://github.com/jeromeetienne/ts_knowledge_graph),
built with [Nextra 4](https://nextra.site) on top of Next.js (static export). It
documents **how to drive the tool** — the CLI and the task-oriented guides — not
the extractor internals. There is no auto-generated API reference here by design.

The whole site is a build artifact: it compiles to plain static HTML in `out/`
with no server at request time, and is published to GitHub Pages.

## Develop

```bash
npm install
npm run dev        # → http://localhost:3000
```

All content is hand-written MDX under [`content/`](content). Sidebar order and
labels come from the `_meta.ts` file in each folder.

## Build

```bash
npm run build      # static export → out/
npm run typecheck  # tsc --noEmit
```

## Deploy

The site targets the GitHub Pages project page at
`https://jeromeetienne.github.io/ts_knowledge_graph/`, which is why
`next.config.mjs` sets `basePath: '/ts_knowledge_graph'` in production.

Deployment is automated by the
[`deploy-docsite`](../../.github/workflows/deploy-docsite.yml) GitHub Actions
workflow: any push to `main` that touches `contribs/docsite/**` builds the static
export and publishes `out/` to GitHub Pages (it can also be run manually from the
Actions tab). The repository's Pages source must be set to **GitHub Actions**
(Settings → Pages → Build and deployment → Source).

The workflow uploads **only** `contribs/docsite/out` — a self-contained static
export with no repository files — which is what keeps the Pages build clean.
`actions/upload-pages-artifact` writes its own `.nojekyll`, so the `_next/` asset
folder is preserved without any manual step.

## Layout

```
content/
├── _meta.ts                 # top-level sidebar order
├── index.mdx                # introduction / landing
├── getting-started/         # install + end-to-end pipeline walk-through
├── concepts/                # graph model, why a semantic graph
├── static-analysis/         # the task-oriented analysis guide
├── commands/                # one page per CLI command (Build / Query / Use)
└── agent/                   # the Claude Code slash-command surface
```
