// @ts-check
/** @import { CyCollection, RawEdge, RawNode } from '../../types/app_globals.js' */
import { NODE_COLORS, SOURCE_FILE_PATTERN } from '../core/constants.js';
import { state } from '../core/app_state.js';
import { Dom } from '../core/dom.js';
import { Util } from '../core/util.js';
import { Edges } from '../graph/edges.js';
import { Tooltips } from '../ui/tooltips.js';

/**
 * Node selection, the back/forward selection history, and the detail panel that
 * lists a node's incoming/outgoing edges (each deep-linkable to GitHub when the
 * graph carries source provenance).
 */
export class Selection {
	/**
	 * Selects a node: fades everything but its closed neighbourhood, highlights it,
	 * and renders its details. User-driven selections also push onto the back/forward
	 * history; replaying that history passes `recordHistory` false so navigating the
	 * trail does not rewrite it.
	 * @param {CyCollection} node
	 * @param {boolean} [recordHistory]
	 */
	static select(node, recordHistory = true) {
		const cy = state.cy;
		if (cy === undefined) {
			return;
		}
		cy.elements().addClass('faded').removeClass('sel');
		const hood = node.closedNeighborhood();
		hood.removeClass('faded');
		node.addClass('sel');
		Selection.renderDetails(node);
		if (recordHistory === true) {
			Selection.recordSelection(node.id());
		}
	}

	static clearSelection() {
		if (state.cy !== undefined) {
			state.cy.elements().removeClass('faded sel');
		}
		Dom.el('details-body').textContent = 'click a node';
	}

	/**
	 * Records a user-driven selection on the back/forward history: discards any
	 * entries ahead of the cursor (selecting after going back starts a new branch),
	 * appends the node id, and advances the cursor. Re-selecting the current node is
	 * ignored so the trail never holds consecutive duplicates.
	 * @param {string} id
	 */
	static recordSelection(id) {
		if (state.history[state.historyIndex] === id) {
			return;
		}
		state.history.length = state.historyIndex + 1;
		state.history.push(id);
		state.historyIndex = state.history.length - 1;
		Selection.updateHistoryButtons();
	}

	/**
	 * Steps the selection cursor by `delta` (−1 back, +1 forward) and re-selects the
	 * node there — without recording — then centres it. A no-op past either end of the
	 * history or when the target node is no longer in the graph.
	 * @param {number} delta
	 */
	static navigateHistory(delta) {
		const cy = state.cy;
		if (cy === undefined) {
			return;
		}
		const nextIndex = state.historyIndex + delta;
		if (nextIndex < 0 || nextIndex >= state.history.length) {
			return;
		}
		const node = cy.getElementById(state.history[nextIndex]);
		if (node.length !== 1) {
			return;
		}
		state.historyIndex = nextIndex;
		Selection.select(node, false);
		cy.animate({ center: { eles: node }, zoom: 2 }, { duration: 350 });
		Selection.updateHistoryButtons();
	}

	/** Enables each history button only when a step in that direction exists. */
	static updateHistoryButtons() {
		Dom.buttonEl('nav-back').disabled = state.historyIndex <= 0;
		Dom.buttonEl('nav-forward').disabled = state.historyIndex >= state.history.length - 1;
	}

	/**
	 * Centers and selects a node by id — shared by the hotspots list and search results.
	 * @param {string} id
	 */
	static focusNode(id) {
		const cy = state.cy;
		if (cy === undefined) {
			return;
		}
		const node = cy.getElementById(id);
		if (node.length === 1) {
			Selection.select(node);
			cy.animate({ center: { eles: node }, zoom: 2 }, { duration: 350 });
		}
	}

	/**
	 * Builds a GitHub permalink for a node's file at the analysed commit, or
	 * `undefined` when no source was configured (server-side `--source`) or the path
	 * is not a real source file. Line anchors are added only when a start line is known.
	 * @param {unknown} filePath
	 * @param {number} startLine
	 * @returns {string | undefined}
	 */
	static githubFileUrl(filePath, startLine) {
		const source = window.GRAPH_SOURCE;
		if (source === undefined || source === null || source.github === undefined) {
			return undefined;
		}
		if (typeof filePath !== 'string' || SOURCE_FILE_PATTERN.test(filePath) === false) {
			return undefined;
		}
		const { baseUrl, commit, prefix } = source.github;
		const encoded = `${prefix ?? ''}${filePath}`.split('/').map((segment) => encodeURIComponent(segment)).join('/');
		const anchor = startLine > 0 ? `#L${startLine}` : '';
		return `${baseUrl}/blob/${commit}/${encoded}${anchor}`;
	}

	/** @param {CyCollection} node */
	static renderDetails(node) {
		const id = node.id();
		const color = NODE_COLORS[node.data('kind')] ?? '#9ca3af';
		const outgoing = state.edges.filter((edge) => edge.from === id);
		const incoming = state.edges.filter((edge) => edge.to === id);
		const nodeById = new Map(state.nodes.map((entry) => /** @type {[string, RawNode]} */ ([entry.id, entry])));

		/**
		 * @param {RawEdge[]} edges
		 * @param {'out' | 'in'} direction
		 */
		const renderEdgeRows = (edges, direction) => edges.map((edge) => {
			const otherId = direction === 'out' ? edge.to : edge.from;
			const other = nodeById.get(otherId);
			const name = other === undefined ? otherId : other.name;
			const arrow = direction === 'out' ? '→' : '←';
			const count = Edges.edgeCount(edge);
			const countBadge = count > 1 ? `<span class="edge-count">×${count}</span>` : '';
			return `<div class="edge-row"><span class="edge-kind">${Util.escapeHtml(edge.kind)}</span>${countBadge}<span class="edge-arrow">${arrow}</span><a class="edge-target" data-target="${Util.escapeHtml(otherId)}">${Util.escapeHtml(name)}</a></div>`;
		}).join('');

		const runtime = node.data('runtime');
		const runtimeBlock = runtime === undefined || runtime === null ? '' : `
			<div class="runtime-block">
				<h3>runtime</h3>
				<div class="metric"><span>self-time</span><strong>${Util.escapeHtml(Util.formatMs(runtime.selfMs ?? 0))}</strong></div>
				<div class="metric"><span>samples</span><strong>${Util.escapeHtml(String(runtime.samples ?? 0))}</strong></div>
				<div class="metric"><span>source</span><strong>${Util.escapeHtml(String(runtime.source ?? '—'))}</strong></div>
			</div>`;

		const filePath = node.data('filePath');
		const startLine = node.data('startLine');
		const locationText = `${filePath}${startLine > 0 ? ':' + startLine : ''}`;
		const fileUrl = Selection.githubFileUrl(filePath, startLine);
		const locationHtml = fileUrl === undefined
			? Util.escapeHtml(locationText)
			: `<a class="file-link" href="${Util.escapeHtml(fileUrl)}" target="_blank" rel="noopener noreferrer" title="open on GitHub">${Util.escapeHtml(locationText)}</a>`;

		Dom.el('details-body').innerHTML = `
			<div><span class="kind-tag" style="background:${color}">${Util.escapeHtml(node.data('kind'))}</span> <strong>${Util.escapeHtml(node.data('name'))}</strong></div>
			<div>${locationHtml}</div>
			<div class="id">${Util.escapeHtml(id)}</div>
			${runtimeBlock}
			<h3>outgoing (${outgoing.length})</h3>${renderEdgeRows(outgoing, 'out')}
			<h3>incoming (${incoming.length})</h3>${renderEdgeRows(incoming, 'in')}
		`;
		Dom.el('details-body').querySelectorAll('a[data-target]').forEach((rawLink) => {
			const link = /** @type {HTMLElement} */ (rawLink);
			const targetId = link.dataset.target ?? '';
			link.addEventListener('click', () => {
				const cy = state.cy;
				if (cy === undefined) {
					return;
				}
				const target = cy.getElementById(targetId);
				if (target.length === 1) {
					Selection.select(target);
					cy.animate({ center: { eles: target } }, { duration: 300 });
				}
			});
			const other = nodeById.get(targetId);
			if (other !== undefined) {
				link.insertAdjacentElement('afterend', Tooltips.makeNodeHelpBadge(other));
			}
		});
	}
}
