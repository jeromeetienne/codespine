// @ts-check
/** @import { RawEdge } from '../types/app_globals.js' */

/** Edge-weight helpers: call-site multiplicity and the stroke width derived from it. */
export class Edges {
	/**
	 * Reads the call-site multiplicity off a raw edge's metadata; defaults to 1 when absent.
	 * @param {RawEdge} edge
	 * @returns {number}
	 */
	static edgeCount(edge) {
		if (edge.metadata === undefined || edge.metadata === null) {
			return 1;
		}
		const count = edge.metadata.count;
		return typeof count === 'number' && count > 0 ? count : 1;
	}

	/**
	 * Maps a call-site count to a stroke width: count 1 keeps the baseline, higher counts thicken sub-linearly.
	 * @param {number} count
	 * @returns {number}
	 */
	static edgeWidth(count) {
		const value = typeof count === 'number' && count > 0 ? count : 1;
		return 1 + Math.sqrt(value - 1) * 1.8;
	}
}
