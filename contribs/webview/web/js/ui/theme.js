// @ts-check
import { THEME_STORAGE_KEY } from '../core/constants.js';
import { state } from '../core/app_state.js';
import { Dom } from '../core/dom.js';
import { Graph } from '../graph/graph.js';

/**
 * Light/dark theme: resolves the active theme (stored override, then OS
 * preference), applies it by flipping the `data-theme` attribute the stylesheet
 * keys off, and re-styles the graph so its canvas-drawn colours track the theme.
 */
export class Theme {
	/**
	 * Reads the persisted theme override, or `null` when none is set or storage is unavailable.
	 * @returns {'light' | 'dark' | null}
	 */
	static storedTheme() {
		try {
			const value = localStorage.getItem(THEME_STORAGE_KEY);
			return value === 'light' || value === 'dark' ? value : null;
		} catch {
			return null;
		}
	}

	/**
	 * Resolves the active theme: an explicit stored choice wins, otherwise the OS
	 * `prefers-color-scheme`, otherwise dark.
	 * @returns {'light' | 'dark'}
	 */
	static resolveTheme() {
		const stored = Theme.storedTheme();
		if (stored !== null) {
			return stored;
		}
		return window.matchMedia('(prefers-color-scheme: light)').matches === true ? 'light' : 'dark';
	}

	/**
	 * Applies a theme: flips the `data-theme` attribute the stylesheet keys off,
	 * updates the toggle glyph, and re-styles the graph so its canvas-drawn colours
	 * (labels, selection ring, node borders) track the theme.
	 * @param {'light' | 'dark'} theme
	 */
	static applyTheme(theme) {
		document.documentElement.setAttribute('data-theme', theme);
		const toggle = Dom.el('theme-toggle');
		toggle.textContent = theme === 'dark' ? '☀' : '☾';
		toggle.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
		if (state.cy !== undefined) {
			state.cy.style(Graph.cyStyle());
		}
	}

	/**
	 * Wires the theme toggle: clicking persists and applies the opposite theme, and
	 * — while no explicit choice is stored — the viewer follows later OS changes.
	 */
	static setupTheme() {
		Theme.applyTheme(Theme.resolveTheme());
		Dom.el('theme-toggle').addEventListener('click', () => {
			const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
			try {
				localStorage.setItem(THEME_STORAGE_KEY, next);
			} catch {
				/* storage unavailable (private mode, file://) — apply for this session only */
			}
			Theme.applyTheme(next);
		});
		window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
			if (Theme.storedTheme() === null) {
				Theme.applyTheme(event.matches === true ? 'light' : 'dark');
			}
		});
	}
}
