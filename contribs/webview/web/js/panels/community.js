// @ts-check
/** @import { RawNode } from '../../types/app_globals.js' */
import { state } from '../core/app_state.js';
import { Dom } from '../core/dom.js';
import { Legends } from './legends.js';

/**
 * Community detection: reading the cluster index/label `cluster` attaches to
 * each node, a stable per-community colour, and the Communities legend that
 * shows or hides each cluster on the graph.
 */
export class Community {
	/**
	 * Reads the integer community index `cluster` attaches as `metadata.community`,
	 * or `undefined` when the graph has not been clustered.
	 * @param {RawNode} node
	 * @returns {number | undefined}
	 */
	static nodeCommunity(node) {
		if (node.metadata === undefined || node.metadata === null) {
			return undefined;
		}
		const community = node.metadata.community;
		return typeof community === 'number' ? community : undefined;
	}

	/**
	 * Reads the human-readable community label `cluster` attaches as
	 * `metadata.communityLabel`. Every clustered node carries one, written alongside
	 * its community index, so this is defined whenever {@link Community.nodeCommunity} is.
	 * @param {RawNode} node
	 * @returns {string | undefined}
	 */
	static nodeCommunityLabel(node) {
		if (node.metadata === undefined || node.metadata === null) {
			return undefined;
		}
		const label = node.metadata.communityLabel;
		return typeof label === 'string' ? label : undefined;
	}

	/**
	 * A stable, theme-independent colour per community index, spread around the hue
	 * circle by the golden angle so adjacent indices stay distinct. Fixed
	 * saturation/lightness keep it legible on both the light and dark canvas, like
	 * the kind palette.
	 * @param {number} index
	 * @returns {string}
	 */
	static communityColor(index) {
		const hue = Math.round((index * 137.508) % 360);
		return `hsl(${hue}, 65%, 55%)`;
	}

	/**
	 * Counts members per community across the loaded nodes, as `[index, count]`
	 * pairs sorted by size descending (the order `cluster` reports them in).
	 * @param {RawNode[]} nodes
	 * @returns {[number, number][]}
	 */
	static communityCounts(nodes) {
		/** @type {Map<number, number>} */
		const counts = new Map();
		for (const node of nodes) {
			const community = Community.nodeCommunity(node);
			if (community !== undefined) {
				counts.set(community, (counts.get(community) ?? 0) + 1);
			}
		}
		return [...counts.entries()].sort((a, b) => b[1] - a[1]);
	}

	/**
	 * Maps each community index to its label, read from the first member node seen —
	 * `cluster` writes the same label onto every member, so one read per community
	 * suffices.
	 * @param {RawNode[]} nodes
	 * @returns {Map<number, string>}
	 */
	static communityLabels(nodes) {
		/** @type {Map<number, string>} */
		const labels = new Map();
		for (const node of nodes) {
			const community = Community.nodeCommunity(node);
			if (community === undefined || labels.has(community) === true) {
				continue;
			}
			const label = Community.nodeCommunityLabel(node);
			if (label !== undefined) {
				labels.set(community, label);
			}
		}
		return labels;
	}

	/**
	 * Renders the Communities legend as visibility filters — a checkbox + swatch +
	 * member count per community, plus a master "all" toggle — so a community can be
	 * shown or hidden on the graph, mirroring the node/edge kind legends. The section
	 * is hidden when the graph is un-clustered.
	 */
	static renderCommunities() {
		const section = Dom.el('communities');
		const container = Dom.el('community-legend');
		container.innerHTML = '';
		if (state.communities.length === 0) {
			section.classList.add('empty');
			return;
		}
		section.classList.remove('empty');

		const indices = state.communities.map(([index]) => index);
		/** @type {HTMLInputElement[]} */
		const childCheckboxes = [];

		const master = document.createElement('input');
		master.type = 'checkbox';
		const syncMaster = () => {
			const hiddenCount = indices.filter((index) => state.hiddenCommunities.has(index) === true).length;
			master.checked = hiddenCount === 0;
			master.indeterminate = hiddenCount > 0 && hiddenCount < indices.length;
		};
		master.addEventListener('change', () => {
			const allVisible = indices.every((index) => state.hiddenCommunities.has(index) === false);
			for (const index of indices) {
				if (allVisible === true) {
					state.hiddenCommunities.add(index);
				} else {
					state.hiddenCommunities.delete(index);
				}
			}
			for (const child of childCheckboxes) {
				child.checked = state.hiddenCommunities.has(Number(child.dataset.community)) === false;
			}
			syncMaster();
			Legends.applyFilters();
		});
		const masterLabel = document.createElement('label');
		masterLabel.className = 'master';
		masterLabel.title = 'show or hide every community';
		const spacer = document.createElement('span');
		spacer.className = 'swatch spacer';
		const masterText = document.createElement('span');
		masterText.textContent = 'all';
		masterLabel.append(master, spacer, masterText);
		container.appendChild(masterLabel);

		for (const [index, count] of state.communities) {
			const row = document.createElement('label');
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.dataset.community = String(index);
			checkbox.checked = state.hiddenCommunities.has(index) === false;
			checkbox.addEventListener('change', () => {
				if (checkbox.checked === true) {
					state.hiddenCommunities.delete(index);
				} else {
					state.hiddenCommunities.add(index);
				}
				syncMaster();
				Legends.applyFilters();
			});
			childCheckboxes.push(checkbox);
			const swatch = document.createElement('span');
			swatch.className = 'swatch';
			swatch.style.background = Community.communityColor(index);
			const text = document.createElement('span');
			text.textContent = /** @type {string} */ (state.communityLabels.get(index));
			const countSpan = document.createElement('span');
			countSpan.className = 'count';
			countSpan.textContent = String(count);
			row.append(checkbox, swatch, text, countSpan);
			container.appendChild(row);
		}

		syncMaster();
	}
}
