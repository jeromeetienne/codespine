// @ts-check
import { FOLD_STORAGE_KEY } from './constants.js';
import { Tooltips } from './tooltips.js';

/**
 * Foldable sidebar sections: restores and persists each section's collapsed
 * state in localStorage, and appends the shared `?` help badge to every header
 * that carries a `data-help` description.
 */
export class Folds {
	/**
	 * Reads the persisted collapsed-by-key map, tolerating absent or malformed storage.
	 * @returns {Record<string, boolean>}
	 */
	static loadFolds() {
		try {
			const raw = localStorage.getItem(FOLD_STORAGE_KEY);
			const parsed = raw === null ? {} : JSON.parse(raw);
			return parsed !== null && typeof parsed === 'object' ? parsed : {};
		} catch {
			return {};
		}
	}

	/**
	 * Persists the collapsed-by-key map; a no-op when storage is unavailable (private mode, file://).
	 * @param {Record<string, boolean>} folds
	 */
	static saveFolds(folds) {
		try {
			localStorage.setItem(FOLD_STORAGE_KEY, JSON.stringify(folds));
		} catch {
			return;
		}
	}

	/**
	 * Wires every `.foldable` sidebar header to collapse the elements that follow it
	 * (handled in CSS via `.collapsed ~ *`), restoring and persisting the per-section
	 * state in localStorage so folds survive reloads.
	 */
	static setupFolds() {
		const folds = Folds.loadFolds();
		for (const rawHeader of document.querySelectorAll('#sidebar .foldable')) {
			const header = /** @type {HTMLElement} */ (rawHeader);
			const key = header.dataset.fold;
			if (key === undefined) {
				continue;
			}
			header.classList.toggle('collapsed', folds[key] === true);
			header.addEventListener('click', () => {
				folds[key] = header.classList.toggle('collapsed');
				Folds.saveFolds(folds);
			});
		}
	}

	/**
	 * Appends a `?` help badge to every foldable sidebar header that carries a
	 * `data-help` description, reusing the same badge and shared tooltip as the
	 * legends. The badge swallows its own clicks, so opening a section's help never
	 * toggles its fold.
	 */
	static setupSectionHelp() {
		for (const rawHeader of document.querySelectorAll('#sidebar .foldable[data-help]')) {
			const header = /** @type {HTMLElement} */ (rawHeader);
			const description = header.dataset.help;
			if (description === undefined || description.length === 0) {
				continue;
			}
			const label = header.textContent?.trim() ?? '';
			header.appendChild(Tooltips.makeHelpBadge(label, description));
		}
	}
}
