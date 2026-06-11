import { Shape } from './shape.js';
import type { BoundingBox, Point } from '../geometry/types.js';
import type { Renderable } from '../render/renderable.js';

/** A circle defined by a centre point and a radius. */
export class Circle extends Shape implements Renderable {
	private readonly center: Point;
	private readonly radius: number;

	constructor(center: Point, radius: number) {
		super();
		this.center = center;
		this.radius = radius;
	}

	override area(): number {
		return Math.PI * this.radius * this.radius;
	}

	override boundingBox(): BoundingBox {
		return {
			min: { x: this.center.x - this.radius, y: this.center.y - this.radius },
			max: { x: this.center.x + this.radius, y: this.center.y + this.radius },
		};
	}

	render(): string {
		return `Circle(r=${this.radius})`;
	}
}
