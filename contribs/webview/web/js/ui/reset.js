// @ts-check
import { STORAGE_PREFIX } from '../core/constants.js';
import { Dom } from '../core/dom.js';

/**
 * The "Reset view" control: clears every persisted viewer preference (theme,
 * sidebar folds, collapsed state, and any future layout preferences) and reloads
 * so the viewer returns to its default state with the default graph layout. All
 * other state (filters, encoding, selection) lives in memory and resets on reload.
 */
export class Reset {
	/**
	 * Removes every localStorage key under {@link STORAGE_PREFIX}; a no-op when
	 * storage is unavailable (private mode, file://). Keys are collected before
	 * removal so the live `localStorage.length` is not mutated mid-iteration.
	 */
	static clearPreferences() {
		try {
			/** @type {string[]} */
			const keys = [];
			for (let index = 0; index < localStorage.length; index += 1) {
				const key = localStorage.key(index);
				if (key !== null && key.startsWith(STORAGE_PREFIX) === true) {
					keys.push(key);
				}
			}
			for (const key of keys) {
				localStorage.removeItem(key);
			}
		} catch {
			return;
		}
	}

	/** Wires the Reset view button: clears saved preferences, then reloads to the default view. */
	static setupReset() {
		Dom.el('reset-view').addEventListener('click', () => {
			Reset.clearPreferences();
			location.reload();
		});
	}
}
