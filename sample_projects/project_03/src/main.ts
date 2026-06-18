import { Circle } from './shapes/circle.js';
import { Rectangle } from './shapes/rectangle.js';
import { Square } from './shapes/square.js';
import type { Shape } from './shapes/shape.js';
import type { Renderable } from './render/renderable.js';

/**
 * A tiny end-to-end example, runnable with `npm run dev` (or `npx tsx
 * src/main.ts`).
 *
 * It also roots the call graph: `main` is *not* exported, so its `new` calls
 * give the shape classes inbound `INSTANTIATES` edges and its method calls keep
 * the hierarchy live.
 */
function main(): void {
	const shapes: Array<Shape & Renderable> = [
		new Circle({ x: 0, y: 0 }, 2),
		new Rectangle({ x: 0, y: 0 }, 3, 4),
		new Square({ x: 0, y: 0 }, 5),
	];
	const origin = { x: 0, y: 0 };
	for (const shape of shapes) {
		const containsOrigin = shape.withinBounds(origin);
		console.log(`${shape.render()} — ${shape.describe()} — contains origin? ${containsOrigin}`);
	}
}

main();
