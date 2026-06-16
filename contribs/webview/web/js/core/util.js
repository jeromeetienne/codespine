// @ts-check
/** @import { RawNode } from '../../types/app_globals.js' */
import { ESCAPE_REPLACEMENTS } from './constants.js';

/** Small, pure string/number/collection helpers shared across the render modules. */
export class Util {
	/**
	 * A node's stored JSDoc summary (`metadata.documentation`), or `undefined` when
	 * the node carries none. The data layer caps and single-lines the text, so callers
	 * may render it directly (after escaping).
	 * @param {RawNode} node
	 * @returns {string | undefined}
	 */
	static nodeDocumentation(node) {
		const metadata = node.metadata;
		if (metadata === undefined || metadata === null) {
			return undefined;
		}
		return typeof metadata.documentation === 'string' && metadata.documentation.length > 0
			? metadata.documentation
			: undefined;
	}

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
