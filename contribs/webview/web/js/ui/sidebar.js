// @ts-check
import { SIDEBAR_STORAGE_KEY } from '../core/constants.js';
import { state } from '../core/app_state.js';
import { Dom } from '../core/dom.js';

/**
 * Collapsible left sidebar: restores and persists whether the whole sidebar is
 * folded away in localStorage, and wires the toggle button that flips it. When
 * collapsed, the graph canvas takes the full width (handled in CSS via the
 * `sidebar-collapsed` body class).
 */
export class Sidebar {
	/**
	 * Reads the persisted collapsed flag, tolerating absent or malformed storage.
	 * @returns {boolean}
	 */
	static loadCollapsed() {
		try {
			return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
		} catch {
			return false;
		}
	}

	/**
	 * Persists the collapsed flag; a no-op when storage is unavailable (private mode, file://).
	 * @param {boolean} collapsed
	 */
	static saveCollapsed(collapsed) {
		try {
			localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
		} catch {
			return;
		}
	}

	/**
	 * Applies the collapsed state: flips the `sidebar-collapsed` body class the
	 * stylesheet keys off, updates the toggle's glyph, label and `aria-expanded` so
	 * it reads as the opposite action, and resizes the graph so its canvas tracks
	 * the freed or reclaimed width.
	 * @param {boolean} collapsed
	 */
	static applyCollapsed(collapsed) {
		document.body.classList.toggle('sidebar-collapsed', collapsed);
		const toggle = Dom.el('sidebar-toggle');
		toggle.textContent = collapsed ? '»' : '«';
		toggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
		toggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
		toggle.setAttribute('aria-expanded', String(collapsed === false));
		if (state.cy !== undefined) {
			state.cy.resize();
		}
	}

	/**
	 * Wires the sidebar toggle: applies the stored state, then on each click flips
	 * and persists it.
	 */
	static setupSidebar() {
		let collapsed = Sidebar.loadCollapsed();
		Sidebar.applyCollapsed(collapsed);
		Dom.el('sidebar-toggle').addEventListener('click', () => {
			collapsed = collapsed === false;
			Sidebar.saveCollapsed(collapsed);
			Sidebar.applyCollapsed(collapsed);
		});
	}
}
