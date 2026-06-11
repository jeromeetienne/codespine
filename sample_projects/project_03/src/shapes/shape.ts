import type { BoundingBox } from '../geometry/types.js';

/** Abstract base class for all 2D shapes. */
export abstract class Shape {
	/** The shape's area in square units. */
	abstract area(): number;

	/** The smallest axis-aligned box that contains the shape. */
	abstract boundingBox(): BoundingBox;

	/** A human-readable summary including the computed area. */
	describe(): string {
		return `${this.constructor.name} with area ${this.area().toFixed(2)}`;
	}
}
