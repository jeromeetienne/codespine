// @ts-check
/** @import { CyCollection, CyCore, RawNode } from '../types/app_globals.js' */
import { HOVER_TOOLTIP_DELAY_MS, NODE_COLORS } from './constants.js';
import { Dom } from './dom.js';
import { Util } from './util.js';

/** @type {HTMLElement | undefined} */
let tooltipEl;

/**
 * Pending dwell timer id for the canvas hover tooltip; cleared on mouse-out or
 * any canvas interaction.
 * @type {number | undefined}
 */
let hoverTooltipTimer;

/**
 * The shared hover tooltip and the `?` help badges that drive it. A single
 * tooltip element is reused for the sidebar badges and the canvas hover, so the
 * sidebar's overflow can never clip it.
 */
export class Tooltips {
	/** Lazily creates the single shared tooltip element, appended to <body> so the sidebar's overflow cannot clip it. */
	static ensureTooltip() {
		if (tooltipEl === undefined) {
			tooltipEl = document.createElement('div');
			tooltipEl.className = 'kind-tooltip';
			tooltipEl.hidden = true;
			document.body.appendChild(tooltipEl);
		}
		return tooltipEl;
	}

	/**
	 * Reveals the shared tooltip with the given content — plain text, or rendered
	 * HTML when `isHtml` is true (callers pass only escaped markup) — and returns it
	 * for positioning. Assigning the content replaces any prior text or HTML, so the
	 * tooltip never carries stale markup between its plain and rich uses.
	 * @param {string} content
	 * @param {boolean} isHtml
	 * @returns {HTMLElement}
	 */
	static fillTooltip(content, isHtml) {
		const tip = Tooltips.ensureTooltip();
		if (isHtml === true) {
			tip.innerHTML = content;
		} else {
			tip.textContent = content;
		}
		tip.hidden = false;
		return tip;
	}

	/**
	 * Positions the shown tooltip, preferring below and flipping above when it would
	 * overflow the viewport bottom, and clamping horizontally to stay on screen.
	 * @param {HTMLElement} tip
	 * @param {number} left preferred left edge
	 * @param {number} belowTop top edge when placed below the anchor point
	 * @param {number} aboveBottom bottom edge to align to when flipped above
	 */
	static placeTooltip(tip, left, belowTop, aboveBottom) {
		const margin = 8;
		let top = belowTop;
		if (top + tip.offsetHeight > window.innerHeight - margin) {
			top = Math.max(margin, aboveBottom - tip.offsetHeight);
		}
		const clampedLeft = Math.max(margin, Math.min(left, window.innerWidth - tip.offsetWidth - margin));
		tip.style.top = `${top}px`;
		tip.style.left = `${clampedLeft}px`;
	}

	/**
	 * Shows the shared tooltip just below an anchor element, flipping above when it
	 * would overflow. Used by the sidebar help badges.
	 * @param {HTMLElement} anchor
	 * @param {string} content
	 * @param {boolean} [isHtml]
	 */
	static showTooltip(anchor, content, isHtml = false) {
		const tip = Tooltips.fillTooltip(content, isHtml);
		const rect = anchor.getBoundingClientRect();
		Tooltips.placeTooltip(tip, rect.left, rect.bottom + 6, rect.top - 6);
	}

	/**
	 * Shows the shared tooltip anchored to a graph node: horizontally centred on the
	 * node and placed just below it, flipping above when it would overflow. The
	 * node's rendered geometry is read at show time, so the placement reflects the
	 * current zoom and pan. Used by the canvas hover tooltip.
	 * @param {CyCollection} node
	 * @param {string} content
	 * @param {boolean} [isHtml]
	 */
	static showTooltipAtNode(node, content, isHtml = false) {
		const tip = Tooltips.fillTooltip(content, isHtml);
		const cyRect = Dom.el('cy').getBoundingClientRect();
		const center = node.renderedPosition();
		const radius = node.renderedHeight() / 2;
		const centerX = cyRect.left + center.x;
		const centerY = cyRect.top + center.y;
		Tooltips.placeTooltip(tip, centerX - tip.offsetWidth / 2, centerY + radius + 10, centerY - radius - 10);
	}

	static hideTooltip() {
		if (tooltipEl !== undefined) {
			tooltipEl.hidden = true;
		}
	}

	/** Cancels any pending hover-dwell timer and hides the tooltip it would show. */
	static clearHoverTooltip() {
		if (hoverTooltipTimer !== undefined) {
			clearTimeout(hoverTooltipTimer);
			hoverTooltipTimer = undefined;
		}
		Tooltips.hideTooltip();
	}

	/**
	 * Wires the canvas hover tooltip: resting the pointer on a node for
	 * {@link HOVER_TOOLTIP_DELAY_MS} reveals the same kind / location / id tooltip
	 * the sidebar badges show, anchored to the node's centre. The dwell timer is
	 * cancelled — and any shown tooltip hidden — as soon as the pointer leaves the
	 * node or the canvas is tapped, panned, zoomed, or dragged, so a stale tooltip
	 * never lingers.
	 * @param {CyCore} cy
	 */
	static setupCanvasHover(cy) {
		cy.on('mouseover', 'node', (event) => {
			const node = event.target;
			Tooltips.clearHoverTooltip();
			hoverTooltipTimer = window.setTimeout(() => {
				hoverTooltipTimer = undefined;
				Tooltips.showTooltipAtNode(node, Tooltips.nodeTooltipHtml({
					kind: node.data('kind'),
					name: node.data('name'),
					filePath: node.data('filePath'),
					startLine: node.data('startLine'),
					id: node.id(),
				}), true);
			}, HOVER_TOOLTIP_DELAY_MS);
		});
		cy.on('mouseout', 'node', Tooltips.clearHoverTooltip);
		cy.on('tap pan zoom drag', Tooltips.clearHoverTooltip);
	}

	/**
	 * Builds the shared `?` help badge: a small focusable marker that swallows its
	 * own clicks (so it never toggles a surrounding fold or filter) and reveals the
	 * shared tooltip on hover and keyboard focus. The tooltip shows plain text, or
	 * rendered HTML when `content.html` is given.
	 * @param {string} ariaLabel
	 * @param {{ text: string } | { html: string }} content
	 * @returns {HTMLSpanElement}
	 */
	static makeBadge(ariaLabel, content) {
		const badge = document.createElement('span');
		badge.className = 'help-badge';
		badge.textContent = '?';
		badge.tabIndex = 0;
		badge.setAttribute('role', 'img');
		badge.setAttribute('aria-label', ariaLabel);
		badge.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		const show = () => {
			if ('html' in content) {
				Tooltips.showTooltip(badge, content.html, true);
				return;
			}
			Tooltips.showTooltip(badge, content.text, false);
		};
		badge.addEventListener('mouseenter', show);
		badge.addEventListener('mouseleave', Tooltips.hideTooltip);
		badge.addEventListener('focus', show);
		badge.addEventListener('blur', Tooltips.hideTooltip);
		return badge;
	}

	/**
	 * Builds the `?` help badge shown after a legend kind. Hover and keyboard focus
	 * reveal the shared tooltip with the kind's description.
	 * @param {string} kind
	 * @param {string} description
	 * @returns {HTMLSpanElement}
	 */
	static makeHelpBadge(kind, description) {
		return Tooltips.makeBadge(`${kind}: ${description}`, { text: description });
	}

	/**
	 * Builds the inner HTML of a node tooltip — a colour-coded kind tag with the
	 * name, the source location, and the id — mirroring the selection panel header.
	 * Shared by the sidebar help badges and the canvas hover tooltip. Every field is
	 * escaped, so callers may pass raw node data.
	 * @param {{ kind: string, name: string, filePath: string, startLine: number, id: string }} fields
	 * @returns {string}
	 */
	static nodeTooltipHtml(fields) {
		const color = NODE_COLORS[fields.kind] ?? '#9ca3af';
		const location = Util.nodeLocation(fields.filePath, fields.startLine);
		return `<div class="node-tip-head"><span class="kind-tag" style="background:${Util.escapeHtml(color)}">${Util.escapeHtml(fields.kind)}</span> <strong>${Util.escapeHtml(fields.name)}</strong></div>`
			+ `<div class="node-tip-loc">${Util.escapeHtml(location)}</div>`
			+ `<div class="node-tip-id">${Util.escapeHtml(fields.id)}</div>`;
	}

	/**
	 * Builds a `?` help badge identifying a graph node — its kind, file location and
	 * id — for the node references the sidebar lists (search hits, hotspots, and the
	 * selection panel's neighbour links), so each is recognisable on an unfamiliar
	 * codebase without selecting it. The tooltip mirrors the selection panel's header.
	 * @param {RawNode} node
	 * @returns {HTMLSpanElement}
	 */
	static makeNodeHelpBadge(node) {
		const startLine = node.range === undefined || node.range === null ? 0 : node.range.startLine;
		const fields = { kind: node.kind, name: node.name, filePath: node.filePath, startLine, id: node.id };
		const ariaLabel = `${node.name}: ${node.kind}, ${Util.nodeLocation(node.filePath, startLine)}, ${node.id}`;
		return Tooltips.makeBadge(ariaLabel, { html: Tooltips.nodeTooltipHtml(fields) });
	}
}
