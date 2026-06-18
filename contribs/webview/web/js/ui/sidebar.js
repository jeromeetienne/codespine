// @ts-check
import { SIDEBAR_STORAGE_KEY, SIDEBAR_WIDTH_STORAGE_KEY, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from '../core/constants.js';
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
		Sidebar.applyWidth(Sidebar.loadWidth());
		Sidebar.setupResize();
	}

	/**
	 * Reads the persisted sidebar width in pixels, clamped to the allowed range, or
	 * `undefined` when absent or malformed so the stylesheet default stands.
	 * @returns {number | undefined}
	 */
	static loadWidth() {
		try {
			const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
			if (raw === null) {
				return undefined;
			}
			const width = Number(raw);
			return Number.isFinite(width) === true ? Sidebar.clampWidth(width) : undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Persists the sidebar width in pixels; a no-op when storage is unavailable (private mode, file://).
	 * @param {number} width
	 */
	static saveWidth(width) {
		try {
			localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
		} catch {
			return;
		}
	}

	/**
	 * Clamps a candidate width to [{@link SIDEBAR_MIN_WIDTH}, {@link SIDEBAR_MAX_WIDTH}] and rounds it.
	 * @param {number} width
	 * @returns {number}
	 */
	static clampWidth(width) {
		return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
	}

	/**
	 * Applies a sidebar width by overriding the `--sidebar-width` custom property the
	 * sidebar, resize handle and collapse toggle all key off. A no-op for `undefined`,
	 * leaving the stylesheet default in place.
	 * @param {number | undefined} width
	 */
	static applyWidth(width) {
		if (width === undefined) {
			return;
		}
		document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
	}

	/**
	 * Wires the drag handle at the sidebar's right edge: dragging sets the width to the
	 * pointer's clamped x position live, throttling the graph resize to one per frame,
	 * and on release persists the final width and resizes the canvas once more.
	 */
	static setupResize() {
		const handle = Dom.el('sidebar-resize');
		let frame = 0;
		const resizeGraph = () => {
			frame = 0;
			if (state.cy !== undefined) {
				state.cy.resize();
			}
		};
		handle.addEventListener('pointerdown', (event) => {
			event.preventDefault();
			handle.classList.add('dragging');
			handle.setPointerCapture(event.pointerId);
			const onMove = (/** @type {PointerEvent} */ moveEvent) => {
				Sidebar.applyWidth(Sidebar.clampWidth(moveEvent.clientX));
				if (frame === 0) {
					frame = requestAnimationFrame(resizeGraph);
				}
			};
			const onUp = (/** @type {PointerEvent} */ upEvent) => {
				handle.releasePointerCapture(upEvent.pointerId);
				handle.classList.remove('dragging');
				handle.removeEventListener('pointermove', onMove);
				handle.removeEventListener('pointerup', onUp);
				if (frame !== 0) {
					cancelAnimationFrame(frame);
					frame = 0;
				}
				const width = Sidebar.clampWidth(upEvent.clientX);
				Sidebar.applyWidth(width);
				Sidebar.saveWidth(width);
				if (state.cy !== undefined) {
					state.cy.resize();
				}
			};
			handle.addEventListener('pointermove', onMove);
			handle.addEventListener('pointerup', onUp);
		});
	}
}
