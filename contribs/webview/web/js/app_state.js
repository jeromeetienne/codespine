// @ts-check

/** The single mutable view-model the viewer threads through its render functions. */
/** @type {AppState} */
export const state = {
	nodes: [],
	edges: [],
	cy: undefined,
	hiddenNodeKinds: new Set(),
	hiddenEdgeKinds: new Set(),
	hiddenCommunities: new Set(),
	hideIsolated: false,
	onlyMeasured: false,
	droppedFiles: { nodes: undefined, edges: undefined },
	encoding: 'structural',
	runtime: { maxSelfMs: 0, measuredCount: 0, totalSelfMs: 0 },
	communities: [],
	communityLabels: new Map(),
	history: [],
	historyIndex: -1,
};
