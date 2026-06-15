// @ts-check

/**
 * Typed DOM lookups for the viewer's required template elements. Each accessor
 * throws when the element is absent or of the wrong type, so a missing template
 * node fails loudly here instead of as a later `null` dereference.
 */
export class Dom {
	/**
	 * Looks up a required element by id, throwing when it is absent.
	 * @param {string} id
	 * @returns {HTMLElement}
	 */
	static el(id) {
		const element = document.getElementById(id);
		if (element === null) {
			throw new Error(`missing element #${id}`);
		}
		return element;
	}

	/**
	 * Looks up a required `<input>` by id, narrowing it so `.checked` / `.value` are typed.
	 * @param {string} id
	 * @returns {HTMLInputElement}
	 */
	static inputEl(id) {
		const element = Dom.el(id);
		if ((element instanceof HTMLInputElement) === false) {
			throw new Error(`element #${id} is not an input`);
		}
		return element;
	}

	/**
	 * Looks up a required `<select>` by id, narrowing it so `.value` is typed.
	 * @param {string} id
	 * @returns {HTMLSelectElement}
	 */
	static selectEl(id) {
		const element = Dom.el(id);
		if ((element instanceof HTMLSelectElement) === false) {
			throw new Error(`element #${id} is not a select`);
		}
		return element;
	}

	/**
	 * Looks up a required `<button>` by id, narrowing it so `.disabled` is typed.
	 * @param {string} id
	 * @returns {HTMLButtonElement}
	 */
	static buttonEl(id) {
		const element = Dom.el(id);
		if ((element instanceof HTMLButtonElement) === false) {
			throw new Error(`element #${id} is not a button`);
		}
		return element;
	}

	/**
	 * Narrows a change/input event target to an `<input>` so `.checked` / `.value`
	 * can be read inside handlers bound to known controls.
	 * @param {EventTarget | null} target
	 * @returns {HTMLInputElement}
	 */
	static asInput(target) {
		if ((target instanceof HTMLInputElement) === false) {
			throw new Error('event target is not an input');
		}
		return target;
	}

	/**
	 * Narrows a change-event target to a `<select>` so `.value` can be read inside
	 * the encoding-selector handler.
	 * @param {EventTarget | null} target
	 * @returns {HTMLSelectElement}
	 */
	static asSelect(target) {
		if ((target instanceof HTMLSelectElement) === false) {
			throw new Error('event target is not a select');
		}
		return target;
	}

	/**
	 * Reads a CSS custom property off the document root, trimmed. The Cytoscape
	 * style pulls its theme-dependent colours from the same variables the
	 * stylesheet uses, so switching theme is a single attribute flip plus a graph
	 * re-style.
	 * @param {string} name
	 * @returns {string}
	 */
	static cssVar(name) {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}
}
