import { Rectangle } from './rectangle.js';
import type { Point } from '../geometry/types.js';

/** A square: a rectangle constrained to equal sides. */
export class Square extends Rectangle {
	constructor(origin: Point, side: number) {
		super(origin, side, side);
	}

	/**
	 * Dominant optimisation target: a redundant override. This reimplements
	 * `Rectangle.area` with identical `width * height` logic. Because the
	 * constructor already passes `side` for both width and height, the inherited
	 * `Rectangle.area` is sufficient and this override can be deleted.
	 *
	 * The graph surfaces it as an `OVERRIDES` edge from `Square.area` to
	 * `Rectangle.area` (and `Square` `EXTENDS` `Rectangle`); `references` on
	 * `Rectangle.area` and `neighbors` on `Square.area` both show the relation.
	 */
	override area(): number {
		return this.width * this.height;
	}
}
