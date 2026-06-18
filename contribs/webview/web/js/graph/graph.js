// @ts-check
/** @import { CyCollection, RawEdge, RawNode } from '../../types/app_globals.js' */
import { EDGE_COLORS, NODE_COLORS } from '../core/constants.js';
import { state } from '../core/app_state.js';
import { Dom } from '../core/dom.js';
import { Edges } from './edges.js';
import { Runtime } from '../panels/runtime.js';
import { Community } from '../panels/community.js';
import { Legends } from '../panels/legends.js';
import { Selection } from '../panels/selection.js';
import { Tooltips } from '../ui/tooltips.js';
import { Util } from '../core/util.js';

/**
 * Largest zoom change applied for a single wheel event, expressed as a pixel
 * delta. Trackpads emit many small deltas that stay well under this cap, so
 * their smooth zoom is preserved unchanged; a physical mouse wheel emits one
 * large delta per notch, and this cap bounds it so a single notch no longer
 * makes the zoom leap (issue #154). This is the tuning dial for wheel-zoom feel.
 */
const WHEEL_DELTA_CAP = 25;

/**
 * Graph construction and styling: builds the Cytoscape instance from the loaded
 * nodes/edges, derives its style from the current theme and colour encoding, and
 * drives the layout. The orchestration entry point is {@link Graph.setData},
 * which (re)builds the graph and refreshes every sidebar panel.
 */
export class Graph {
	/**
	 * @param {RawNode[]} nodes
	 * @param {RawEdge[]} edges
	 * @param {string} sourceLabel
	 */
	static setData(nodes, edges, sourceLabel) {
		state.nodes = nodes;
		state.edges = edges;

		const nodeIds = new Set(nodes.map((node) => node.id));
		/** @type {Map<string, number>} */
		const degree = new Map();
		for (const edge of edges) {
			degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
			degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
		}

		let maxSelfMs = 0;
		let measuredCount = 0;
		let totalSelfMs = 0;
		for (const node of nodes) {
			const runtime = Runtime.nodeRuntime(node);
			if (runtime === undefined) {
				continue;
			}
			const selfMs = runtime.selfMs ?? 0;
			measuredCount += 1;
			totalSelfMs += selfMs;
			maxSelfMs = Math.max(maxSelfMs, selfMs);
		}
		state.runtime = { maxSelfMs, measuredCount, totalSelfMs };
		state.communities = Community.communityCounts(nodes);
		state.communityLabels = Community.communityLabels(nodes);
		state.history = [];
		state.historyIndex = -1;
		Selection.updateHistoryButtons();

		const elements = [
			...nodes.map((node) => ({
				group: 'nodes',
				data: { id: node.id, name: node.name, kind: node.kind, filePath: node.filePath, startLine: node.range === undefined ? 0 : node.range.startLine, exported: node.exported === true, degree: degree.get(node.id) ?? 0, runtime: Runtime.nodeRuntime(node), community: Community.nodeCommunity(node), documentation: Util.nodeDocumentation(node) },
			})),
			...edges
				.filter((edge) => nodeIds.has(edge.from) === true && nodeIds.has(edge.to) === true)
				.map((edge) => ({
					group: 'edges',
					data: { id: edge.id, source: edge.from, target: edge.to, kind: edge.kind, count: Edges.edgeCount(edge) },
				})),
		];

		if (state.cy !== undefined) {
			Tooltips.clearHoverTooltip();
			state.cy.destroy();
		}
		const buildStartMs = performance.now();
		state.cy = cytoscape({
			container: Dom.el('cy'),
			elements,
			style: Graph.cyStyle(),
			layout: Graph.layoutOptions('fcose'),
			userZoomingEnabled: false,
		});
		console.log(`[graph] page-load fcose layout: ${Math.round(performance.now() - buildStartMs)} ms (${nodes.length} nodes, ${edges.length} edges)`);
		state.cy.on('tap', 'node', (event) => Selection.select(event.target));
		state.cy.on('tap', (event) => {
			if (event.target === state.cy) {
				Selection.clearSelection();
			}
		});
		Tooltips.setupCanvasHover(state.cy);
		Graph.setupWheelZoom(Dom.el('cy'));

		Legends.buildLegends();
		Runtime.renderRuntime();
		Community.renderCommunities();
		Graph.syncEncodingOptions();
		Legends.applyFilters();
		Dom.el('status').textContent = `${sourceLabel} — ${nodes.length} nodes, ${edges.length} edges`;
	}

	/**
	 * Install a normalized wheel-to-zoom handler on the graph container, in place
	 * of Cytoscape's built-in wheel zoom (disabled with `userZoomingEnabled`).
	 *
	 * Cytoscape maps each wheel event's raw `deltaY` onto an exponential zoom
	 * step. A trackpad reports motion as a stream of small deltas, so zoom is
	 * gradual; a physical mouse wheel reports one large delta per notch, so each
	 * notch makes a big jump and zoom feels far too fast (issue #154). This
	 * handler keeps Cytoscape's own mapping — so the trackpad feel is unchanged —
	 * but first caps the per-event delta at {@link WHEEL_DELTA_CAP}, which only
	 * bites on the large notches a mouse wheel produces.
	 *
	 * The listener is installed once per container and reads the live
	 * `state.cy` on each event, so it keeps working across graph rebuilds (which
	 * destroy and recreate the Cytoscape instance but reuse the container).
	 * @param {HTMLElement} container
	 */
	static setupWheelZoom(container) {
		if (container.dataset.wheelZoom === 'on') {
			return;
		}
		container.dataset.wheelZoom = 'on';
		container.addEventListener('wheel', (event) => {
			if (state.cy === undefined) {
				return;
			}
			event.preventDefault();
			let delta = event.deltaY;
			if (event.deltaMode === 1) {
				delta *= 16;
			} else if (event.deltaMode === 2) {
				delta *= container.clientHeight;
			}
			const capped = Math.max(-WHEEL_DELTA_CAP, Math.min(WHEEL_DELTA_CAP, delta));
			const rect = container.getBoundingClientRect();
			state.cy.zoom({
				level: state.cy.zoom() * Math.pow(10, capped / -250),
				renderedPosition: { x: event.clientX - rect.left, y: event.clientY - rect.top },
			});
		}, { passive: false });
	}

	static cyStyle() {
		const unmeasuredFill = Dom.cssVar('--unmeasured-fill');
		const unmeasuredBorder = Dom.cssVar('--unmeasured-border');
		const nodeBorder = Dom.cssVar('--graph-node-border');
		const nodeBorderWidth = parseFloat(Dom.cssVar('--graph-node-border-width')) || 0;
		const labelColor = Dom.cssVar('--graph-label');
		const labelBg = Dom.cssVar('--graph-label-bg');
		const selBorder = Dom.cssVar('--graph-sel-border');
		/** @param {CyCollection} node */
		const nodeColor = (node) => {
			if (state.encoding === 'runtime') {
				const runtime = node.data('runtime');
				return runtime === undefined || runtime === null ? unmeasuredFill : Runtime.heatColor(Runtime.runtimeFraction(runtime.selfMs));
			}
			if (state.encoding === 'community') {
				const community = node.data('community');
				return community === undefined || community === null ? unmeasuredFill : Community.communityColor(community);
			}
			return NODE_COLORS[node.data('kind')] ?? '#9ca3af';
		};
		/** @param {CyCollection} node */
		const nodeSize = (node) => {
			if (state.encoding !== 'runtime') {
				return 8 + Math.sqrt(node.data('degree')) * 4;
			}
			const runtime = node.data('runtime');
			if (runtime === undefined || runtime === null) {
				return 10;
			}
			return 12 + Runtime.runtimeFraction(runtime.selfMs) * 40;
		};
		/**
		 * Whether the active encoding has no value for this node — un-measured in
		 * runtime mode, or unassigned to a community in community mode. Such nodes get
		 * the muted fill and a dashed border so the gap reads as "no data", not a colour.
		 * @param {CyCollection} node
		 */
		const isUnencoded = (node) =>
			(state.encoding === 'runtime' && (node.data('runtime') === undefined || node.data('runtime') === null))
			|| (state.encoding === 'community' && (node.data('community') === undefined || node.data('community') === null));
		return [
			{
				selector: 'node',
				style: {
					'background-color': nodeColor,
					'width': nodeSize,
					'height': nodeSize,
					'border-width': (/** @type {CyCollection} */ node) => isUnencoded(node) === true ? 1 : nodeBorderWidth,
					'border-color': (/** @type {CyCollection} */ node) => isUnencoded(node) === true ? unmeasuredBorder : nodeBorder,
					'border-style': (/** @type {CyCollection} */ node) => isUnencoded(node) === true ? 'dashed' : 'solid',
					'label': 'data(name)',
					'color': labelColor,
					'font-size': 8,
					'min-zoomed-font-size': 7,
					'text-valign': 'bottom',
					'text-margin-y': 3,
					'text-background-color': labelBg,
					'text-background-opacity': 0.5,
					'text-background-shape': 'roundrectangle',
					'text-background-padding': 2,
				},
			},
			{
				selector: 'edge',
				style: {
					'width': (/** @type {CyCollection} */ edge) => Edges.edgeWidth(edge.data('count')),
					'line-color': (/** @type {CyCollection} */ edge) => EDGE_COLORS[edge.data('kind')] ?? '#475569',
					'target-arrow-color': (/** @type {CyCollection} */ edge) => EDGE_COLORS[edge.data('kind')] ?? '#475569',
					'target-arrow-shape': 'triangle',
					'arrow-scale': 0.6,
					'curve-style': 'bezier',
					'opacity': 0.65,
				},
			},
			{ selector: '.hidden', style: { display: 'none' } },
			{ selector: '.faded', style: { opacity: 0.25, 'text-opacity': 0, 'text-background-opacity': 0 } },
			{ selector: 'node.sel', style: { 'border-width': 3, 'border-color': selBorder, 'border-style': 'solid' } },
		];
	}

	/**
	 * Builds Cytoscape layout options for the given layout name. The `fcose`
	 * layout is made label-aware via `nodeDimensionsIncludeLabels`, so each
	 * node's label box is factored into spacing and labels overlap their neighbours less.
	 * @param {string} name
	 * @returns {Record<string, unknown>}
	 */
	static layoutOptions(name) {
		const base = { name, animate: false, padding: 30 };
		if (name === 'fcose') {
			return { ...base, nodeDimensionsIncludeLabels: true };
		}
		if (name === 'concentric') {
			return { ...base, concentric: (/** @type {CyCollection} */ node) => node.degree(), levelWidth: () => 2 };
		}
		return base;
	}

	static runLayout() {
		const cy = state.cy;
		if (cy === undefined) {
			return;
		}
		const name = Dom.selectEl('layout-select').value;
		const layoutStartMs = performance.now();
		cy.elements(':visible').layout(Graph.layoutOptions(name)).run();
		console.log(`[graph] ${name} relayout: ${Math.round(performance.now() - layoutStartMs)} ms`);
	}

	/**
	 * Enables the `self-time` and `community` colour modes only when the loaded
	 * graph carries that data, falls back to `structural` if the active mode lost
	 * its data, mirrors the choice into the `<select>`, and re-applies the style.
	 */
	static syncEncodingOptions() {
		const select = Dom.selectEl('encoding-select');
		/**
		 * @param {string} value
		 * @param {boolean} enabled
		 */
		const setEnabled = (value, enabled) => {
			const option = select.querySelector(`option[value="${value}"]`);
			if (option instanceof HTMLOptionElement) {
				option.disabled = enabled === false;
			}
		};
		setEnabled('runtime', state.runtime.measuredCount > 0);
		setEnabled('community', state.communities.length > 0);
		if ((state.encoding === 'runtime' && state.runtime.measuredCount === 0)
			|| (state.encoding === 'community' && state.communities.length === 0)) {
			state.encoding = 'structural';
		}
		select.value = state.encoding;
		if (state.cy !== undefined) {
			state.cy.style(Graph.cyStyle());
		}
	}

	/**
	 * Narrows an arbitrary `<select>` value to a known encoding mode, defaulting to `structural`.
	 * @param {string} value
	 * @returns {'structural' | 'runtime' | 'community'}
	 */
	static encodingFromValue(value) {
		return value === 'runtime' || value === 'community' ? value : 'structural';
	}
}
