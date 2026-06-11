/** A point in 2D space. */
export type Point = {
	x: number;
	y: number;
};

/** An axis-aligned bounding box, expressed as its minimum and maximum corners. */
export type BoundingBox = {
	min: Point;
	max: Point;
};

/**
 * A circle's diameter.
 *
 * Incidental dead export: this type alias is referenced by nothing in `src` or
 * `tests`, so `dead-exports` reports it (no inbound `USES_TYPE` / `PARAM_TYPE` /
 * `RETURNS` edge).
 */
export type Diameter = number;
