// @ts-check
import { state } from '../core/app_state.js';
import { Dom } from '../core/dom.js';
import { Util } from '../core/util.js';
import { Tooltips } from '../ui/tooltips.js';
import { Selection } from './selection.js';

/** Symbol/file search over the loaded nodes, rendered as a clickable hit list. */
export class Search {
	static renderSearchResults() {
		const query = Dom.inputEl('search').value.trim().toLowerCase();
		const container = Dom.el('search-results');
		container.innerHTML = '';
		if (query.length < 2) {
			return;
		}
		const hits = state.nodes
			.filter((node) => node.name.toLowerCase().includes(query) === true || node.filePath.toLowerCase().includes(query) === true)
			.slice(0, 15);
		for (const hit of hits) {
			const row = document.createElement('div');
			row.className = 'hit';
			row.innerHTML = `<span class="hit-name">${Util.escapeHtml(hit.name)}</span><span class="loc">${Util.escapeHtml(hit.kind)} · ${Util.escapeHtml(hit.filePath)}</span>`;
			row.appendChild(Tooltips.makeNodeHelpBadge(hit));
			row.addEventListener('click', () => Selection.focusNode(hit.id));
			container.appendChild(row);
		}
	}
}
