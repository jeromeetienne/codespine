import { Shape } from './shape.js';
import type { BoundingBox, Point } from '../geometry/types.js';
import type { Renderable } from '../render/renderable.js';

/** An axis-aligned rectangle defined by its origin corner and dimensions. */
export class Rectangle extends Shape implements Renderable {
	protected readonly origin: Point;
	protected readonly width: number;
	protected readonly height: number;

	constructor(origin: Point, width: number, height: number) {
		super();
		this.origin = origin;
		this.width = width;
		this.height = height;
	}

	override area(): number {
		return this.width * this.height;
	}

	override boundingBox(): BoundingBox {
		return {
			min: { x: this.origin.x, y: this.origin.y },
			max: { x: this.origin.x + this.width, y: this.origin.y + this.height },
		};
	}

	render(): string {
		return `Rectangle(${this.width}x${this.height})`;
	}
}
