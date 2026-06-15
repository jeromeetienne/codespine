// @ts-check
/** @import { NodeRuntime, RawNode } from '../../types/app_globals.js' */
import { HEAT_STOPS, HOTSPOTS_LIMIT } from '../core/constants.js';
import { state } from '../core/app_state.js';
import { Dom } from '../core/dom.js';
import { Util } from '../core/util.js';
import { Tooltips } from '../ui/tooltips.js';
import { Selection } from './selection.js';

/**
 * Runtime self-time: reading the per-node metrics `enrich` attaches, the heat
 * ramp that colours them, and the coverage line + ranked hotspots list the
 * sidebar shows.
 */
export class Runtime {
	/**
	 * Reads the `metadata.runtime` metrics off a raw node, or `undefined` if un-measured.
	 * @param {RawNode} node
	 * @returns {NodeRuntime | undefined}
	 */
	static nodeRuntime(node) {
		if (node.metadata === undefined || node.metadata === null) {
			return undefined;
		}
		const runtime = node.metadata.runtime;
		return runtime === undefined || runtime === null ? undefined : runtime;
	}

	/**
	 * Maps a self-time to [0, 1] on a square-root scale so mid-range hotspots stay visible.
	 * @param {number | undefined} selfMs
	 * @returns {number}
	 */
	static runtimeFraction(selfMs) {
		const max = state.runtime.maxSelfMs;
		if (max <= 0) {
			return 0;
		}
		return Math.sqrt(Math.max(0, selfMs ?? 0) / max);
	}

	/**
	 * Interpolates the heat ramp at the given fraction, returning an `rgb(...)` string.
	 * @param {number} fraction
	 * @returns {string}
	 */
	static heatColor(fraction) {
		const f = Math.min(1, Math.max(0, fraction));
		let lo = HEAT_STOPS[0];
		let hi = HEAT_STOPS[HEAT_STOPS.length - 1];
		for (let i = 0; i < HEAT_STOPS.length - 1; i += 1) {
			if (f >= HEAT_STOPS[i].at && f <= HEAT_STOPS[i + 1].at) {
				lo = HEAT_STOPS[i];
				hi = HEAT_STOPS[i + 1];
				break;
			}
		}
		const span = hi.at - lo.at || 1;
		const t = (f - lo.at) / span;
		/** @param {number} index */
		const channel = (index) => Math.round(lo.color[index] + (hi.color[index] - lo.color[index]) * t);
		return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
	}

	/** Renders the coverage line and the ranked hotspots list from the loaded runtime metrics. */
	static renderRuntime() {
		const section = Dom.el('runtime');
		const measured = state.nodes
			.map((node) => ({ node, runtime: Runtime.nodeRuntime(node) }))
			.filter((entry) => entry.runtime !== undefined)
			.sort((a, b) => (b.runtime?.selfMs ?? 0) - (a.runtime?.selfMs ?? 0));

		if (measured.length === 0) {
			section.classList.add('empty');
			Dom.el('coverage').textContent = 'no runtime data — run `enrich` to measure self-time';
			state.onlyMeasured = false;
			Dom.inputEl('only-measured').checked = false;
			Dom.el('hotspots').innerHTML = '';
			return;
		}

		section.classList.remove('empty');
		Dom.inputEl('only-measured').disabled = false;
		Dom.el('coverage').textContent = `${state.runtime.measuredCount} / ${state.nodes.length} nodes measured · ${Util.formatMs(state.runtime.totalSelfMs)} total self-time`;

		const list = Dom.el('hotspots');
		list.innerHTML = '';
		for (const { node, runtime } of measured.slice(0, HOTSPOTS_LIMIT)) {
			const row = document.createElement('div');
			row.className = 'hotspot';
			row.innerHTML = `<span class="heat-swatch" style="background:${Runtime.heatColor(Runtime.runtimeFraction(runtime?.selfMs))}"></span><span class="hotspot-name">${Util.escapeHtml(node.name)}</span>`;
			row.appendChild(Tooltips.makeNodeHelpBadge(node));
			const ms = document.createElement('span');
			ms.className = 'hotspot-ms';
			ms.textContent = Util.formatMs(runtime?.selfMs ?? 0);
			row.appendChild(ms);
			row.addEventListener('click', () => Selection.focusNode(node.id));
			list.appendChild(row);
		}
	}
}
