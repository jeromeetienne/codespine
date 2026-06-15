// @ts-check
import { EDGE_COLORS, KIND_DESCRIPTIONS, NODE_COLORS } from '../core/constants.js';
import { state } from '../core/app_state.js';
import { Dom } from '../core/dom.js';
import { Util } from '../core/util.js';
import { Tooltips } from '../ui/tooltips.js';

/**
 * The node/edge kind legends and the graph filtering they drive. Each legend is
 * a list of visibility toggles (plus a master "all" toggle); toggling a kind
 * hides or shows its elements via {@link Legends.applyFilters}.
 */
export class Legends {
	static buildLegends() {
		const nodeCounts = Util.countBy(state.nodes.map((node) => node.kind));
		const edgeCounts = Util.countBy(state.edges.map((edge) => edge.kind));
		Legends.renderLegend(Dom.el('node-kinds'), nodeCounts, NODE_COLORS, state.hiddenNodeKinds, KIND_DESCRIPTIONS.nodes);
		Legends.renderLegend(Dom.el('edge-kinds'), edgeCounts, EDGE_COLORS, state.hiddenEdgeKinds, KIND_DESCRIPTIONS.edges);
	}

	/**
	 * @param {HTMLElement} container
	 * @param {[string, number][]} counts
	 * @param {Record<string, string>} colors
	 * @param {Set<string>} hiddenSet
	 * @param {Record<string, string>} descriptions
	 */
	static renderLegend(container, counts, colors, hiddenSet, descriptions) {
		container.innerHTML = '';
		const kinds = counts.map(([kind]) => kind);
		/** @type {HTMLInputElement[]} */
		const childCheckboxes = [];

		/* Master toggle: checked when every kind is visible, indeterminate on a mixed
		   selection. Clicking it reveals all kinds, or hides all when none are hidden. */
		const master = document.createElement('input');
		master.type = 'checkbox';
		const syncMaster = () => {
			const hiddenCount = kinds.filter((kind) => hiddenSet.has(kind) === true).length;
			master.checked = hiddenCount === 0;
			master.indeterminate = hiddenCount > 0 && hiddenCount < kinds.length;
		};

		if (kinds.length > 0) {
			master.addEventListener('change', () => {
				const allVisible = kinds.every((kind) => hiddenSet.has(kind) === false);
				for (const kind of kinds) {
					if (allVisible === true) {
						hiddenSet.add(kind);
					} else {
						hiddenSet.delete(kind);
					}
				}
				for (const child of childCheckboxes) {
					child.checked = hiddenSet.has(child.dataset.kind ?? '') === false;
				}
				syncMaster();
				Legends.applyFilters();
			});
			const masterLabel = document.createElement('label');
			masterLabel.className = 'master';
			masterLabel.title = 'show or hide every kind';
			const spacer = document.createElement('span');
			spacer.className = 'swatch spacer';
			const text = document.createElement('span');
			text.textContent = 'all';
			masterLabel.append(master, spacer, text);
			container.appendChild(masterLabel);
		}

		for (const [kind, count] of counts) {
			const label = document.createElement('label');
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.dataset.kind = kind;
			checkbox.checked = hiddenSet.has(kind) === false;
			checkbox.addEventListener('change', () => {
				if (checkbox.checked === true) {
					hiddenSet.delete(kind);
				} else {
					hiddenSet.add(kind);
				}
				syncMaster();
				Legends.applyFilters();
			});
			childCheckboxes.push(checkbox);
			const swatch = document.createElement('span');
			swatch.className = 'swatch';
			swatch.style.background = colors[kind] ?? '#9ca3af';
			const text = document.createElement('span');
			text.textContent = kind;
			const countSpan = document.createElement('span');
			countSpan.className = 'count';
			countSpan.textContent = String(count);
			label.append(checkbox, swatch, text);
			const description = descriptions?.[kind];
			if (typeof description === 'string' && description.length > 0) {
				label.append(Tooltips.makeHelpBadge(kind, description));
			}
			label.append(countSpan);
			container.appendChild(label);
		}

		syncMaster();
	}

	static applyFilters() {
		const cy = state.cy;
		if (cy === undefined) {
			return;
		}
		cy.batch(() => {
			cy.nodes().forEach((node) => {
				const hiddenByKind = state.hiddenNodeKinds.has(node.data('kind')) === true;
				const unmeasured = node.data('runtime') === undefined || node.data('runtime') === null;
				const hiddenByMeasure = state.onlyMeasured === true && unmeasured === true;
				const community = node.data('community');
				const hiddenByCommunity = community !== undefined && community !== null && state.hiddenCommunities.has(community) === true;
				node.toggleClass('hidden', hiddenByKind === true || hiddenByMeasure === true || hiddenByCommunity === true);
			});
			cy.edges().forEach((edge) => {
				edge.toggleClass('hidden', state.hiddenEdgeKinds.has(edge.data('kind')) === true);
			});
			if (state.hideIsolated === true) {
				cy.nodes().not('.hidden').forEach((node) => {
					const hasVisibleEdge = node.connectedEdges().some((edge) =>
						edge.hasClass('hidden') === false
						&& edge.source().hasClass('hidden') === false
						&& edge.target().hasClass('hidden') === false);
					if (hasVisibleEdge === false) {
						node.addClass('hidden');
					}
				});
			}
		});
	}
}
