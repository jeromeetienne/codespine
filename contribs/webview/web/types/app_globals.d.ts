/**
 * Ambient declarations for the static web viewer (the ES modules under `web/js/`).
 *
 * The page ships as plain, build-free JavaScript and is type-checked in place
 * with `// @ts-check`. This file gives that JavaScript precise types for the
 * data it loads (the knowledge-graph JSONL records, mirrored from
 * `src/schema`), and a deliberately loose surface for the Cytoscape.js library,
 * which is loaded as a global from a CDN and has no bundled types here.
 *
 * The data and Cytoscape types are exported so each module can pull in only the
 * ones it uses with a JSDoc `@import` (no global tsconfig needed for the editor
 * to resolve them); the page-injected globals (`window.*` and the `cytoscape`
 * factory) stay ambient via `declare global`.
 */

/* ---------- knowledge-graph data (mirrors src/schema) ---------- */

/** Source range of a symbol; mirrors `RangeSchema` in `src/schema/node.ts`. */
export interface RawRange {
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
}

/** Per-node runtime metrics attached by `enrich`, read from `metadata.runtime`. */
export interface NodeRuntime {
	selfMs?: number;
	samples?: number;
	source?: string;
}

/** A graph node as serialised in `nodes.jsonl`; mirrors `GraphNodeSchema`. */
export interface RawNode {
	id: string;
	kind: string;
	name: string;
	filePath: string;
	range?: RawRange;
	exported?: boolean;
	metadata?: { runtime?: NodeRuntime | null; community?: number | null; communityLabel?: string | null; documentation?: string | null; [key: string]: unknown } | null;
}

/** A graph edge as serialised in `edges.jsonl`; mirrors `GraphEdgeSchema`. */
export interface RawEdge {
	id: string;
	kind: string;
	from: string;
	to: string;
	metadata?: { count?: number; [key: string]: unknown } | null;
}

/** The embedded `window.GRAPH_DATA` payload written by `scripts/build-data.ts`. */
export interface GraphData {
	nodes: RawNode[];
	edges: RawEdge[];
}

/** The `window.KIND_DESCRIPTIONS` payload: one-line help per node/edge kind. */
export interface KindDescriptions {
	nodes: Record<string, string>;
	edges: Record<string, string>;
}

/** GitHub permalink descriptor; mirrors `GitHubSource` in `src/commands/webview_command.ts`. */
export interface GitHubSource {
	baseUrl: string;
	commit: string;
	prefix: string;
}

/** The `window.GRAPH_SOURCE` payload injected by the `web` command. */
export interface GraphSource {
	github?: GitHubSource;
}

/** The single mutable view-model the viewer threads through its render functions. */
export interface AppState {
	nodes: RawNode[];
	edges: RawEdge[];
	cy: CyCore | undefined;
	hiddenNodeKinds: Set<string>;
	hiddenEdgeKinds: Set<string>;
	hiddenCommunities: Set<number>;
	hideIsolated: boolean;
	onlyMeasured: boolean;
	droppedFiles: { nodes: RawNode[] | undefined; edges: RawEdge[] | undefined };
	encoding: 'structural' | 'runtime' | 'community';
	runtime: { maxSelfMs: number; measuredCount: number; totalSelfMs: number };
	communities: [number, number][];
	communityLabels: Map<number, string>;
	history: string[];
	historyIndex: number;
}

/* ---------- Cytoscape.js (loaded as a CDN global, untyped) ---------- */

/**
 * A Cytoscape collection or single element. Only the surface the viewer uses is
 * declared. `data()` is intentionally `any`: it is Cytoscape's dynamic per-element
 * bag and the one place this otherwise-strict file crosses an untyped boundary.
 */
export interface CyCollection {
	length: number;
	data(name?: string): any;
	id(): string;
	degree(): number;
	renderedPosition(): { x: number; y: number };
	renderedHeight(): number;
	closedNeighborhood(): CyCollection;
	connectedEdges(): CyCollection;
	source(): CyCollection;
	target(): CyCollection;
	addClass(names: string): CyCollection;
	removeClass(names: string): CyCollection;
	toggleClass(names: string, flag?: boolean): CyCollection;
	hasClass(name: string): boolean;
	not(selector: string): CyCollection;
	forEach(each: (element: CyCollection, index: number) => void): void;
	some(test: (element: CyCollection, index: number) => boolean): boolean;
	layout(options: unknown): { run(): CyCollection };
}

/** A Cytoscape event; `target` is the element or core the event fired on. */
export interface CyEvent {
	target: any;
}

/** The Cytoscape core instance returned by the `cytoscape(...)` factory. */
export interface CyCore {
	destroy(): void;
	on(events: string, handler: (event: CyEvent) => void): CyCore;
	on(events: string, selector: string, handler: (event: CyEvent) => void): CyCore;
	style(style?: unknown): CyCore;
	resize(): CyCore;
	elements(selector?: string): CyCollection;
	nodes(selector?: string): CyCollection;
	edges(selector?: string): CyCollection;
	batch(callback: () => void): void;
	getElementById(id: string): CyCollection;
	animate(options: unknown, params?: unknown): CyCore;
	zoom(): number;
	zoom(options: { level: number; renderedPosition?: { x: number; y: number } }): CyCore;
}

export interface CytoscapeOptions {
	container?: HTMLElement | null;
	elements?: unknown;
	style?: unknown;
	layout?: unknown;
	userZoomingEnabled?: boolean;
}

/* ---------- globals injected into the page ---------- */

declare global {
	/** The Cytoscape factory, loaded as a CDN global (see index.html). */
	function cytoscape(options?: CytoscapeOptions): CyCore;
	namespace cytoscape {
		/** Registers a Cytoscape extension (such as the fcose layout) loaded as a CDN global. */
		function use(extension: unknown): void;
	}

	interface Window {
		GRAPH_DATA?: GraphData;
		KIND_DESCRIPTIONS?: KindDescriptions;
		GRAPH_SOURCE?: GraphSource | null;
		cytoscapeFcose?: unknown;
	}
}
