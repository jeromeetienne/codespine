/** Anything that can render itself to a one-line string for display. */
export interface Renderable {
	/** Render a short textual representation. */
	render(): string;
}
