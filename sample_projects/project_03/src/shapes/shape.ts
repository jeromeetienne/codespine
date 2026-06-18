import type { BoundingBox, Point } from '../geometry/types.js';

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

	/**
	 * Whether `point` lies within this shape's axis-aligned bounding box.
	 *
	 * This concrete base method takes an in-project geometry type as a parameter,
	 * so the graph carries a `PARAM_TYPE` edge from `withinBounds` to {@link Point}
	 * — the type-layer edge the rest of the hierarchy expresses only through
	 * constructors, which the extractor does not give `PARAM_TYPE` edges.
	 */
	withinBounds(point: Point): boolean {
		const box = this.boundingBox();
		return point.x >= box.min.x
			&& point.x <= box.max.x
			&& point.y >= box.min.y
			&& point.y <= box.max.y;
	}
}
