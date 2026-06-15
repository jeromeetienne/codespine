// @ts-check
import { ESCAPE_REPLACEMENTS } from './constants.js';

/** Small, pure string/number/collection helpers shared across the render modules. */
export class Util {
	/**
	 * @param {unknown} value
	 * @returns {string}
	 */
	static escapeHtml(value) {
		return String(value).replace(/[&<>"']/g, (char) => ESCAPE_REPLACEMENTS[char]);
	}

	/**
	 * Human-readable self-time: seconds above 1 s, otherwise milliseconds.
	 * @param {number} ms
	 * @returns {string}
	 */
	static formatMs(ms) {
		if (ms >= 1000) {
			return `${(ms / 1000).toFixed(1)} s`;
		}
		if (ms >= 1) {
			return `${ms.toFixed(0)} ms`;
		}
		return `${ms.toFixed(2)} ms`;
	}

	/**
	 * Formats a node's source location as `filePath` or `filePath:line`.
	 * @param {string} filePath
	 * @param {number} startLine
	 * @returns {string}
	 */
	static nodeLocation(filePath, startLine) {
		return `${filePath}${startLine > 0 ? ':' + startLine : ''}`;
	}

	/**
	 * @param {string[]} values
	 * @returns {[string, number][]}
	 */
	static countBy(values) {
		/** @type {Map<string, number>} */
		const counts = new Map();
		for (const value of values) {
			counts.set(value, (counts.get(value) ?? 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => b[1] - a[1]);
	}
}
