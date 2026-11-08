/**
 * Minimum touch-target sizing (Apple HIG: 44x44pt). Pure so the 44pt rule unit-tests in
 * the node vitest env; components spread the results into `hitSlop`.
 *
 * Native hit-testing rejects a touch outside the PARENT's bounds before the child's
 * hitSlop is consulted (Fabric's RCTViewComponentView / Android TouchTargetHelper), so
 * a parent that hugs a small target must grow its bounds by the same slop — see
 * `slopBoundsStyle`.
 */

export const MIN_TAP_TARGET = 44;

/** Per-side slop that grows `size` to at least `min`. */
export function slopFor(size: number, min = MIN_TAP_TARGET): number {
	return Math.max(0, Math.ceil((min - size) / 2));
}

/** Top/bottom only — for wrapped rows of chips, so horizontal neighbours don't overlap. */
export function verticalHitSlop(height: number) {
	const s = slopFor(height);
	return { top: s, bottom: s };
}

/** All four sides, for a square icon button. */
export function squareHitSlop(size: number) {
	const s = slopFor(size);
	return { top: s, bottom: s, left: s, right: s };
}

/**
 * Padding + equal negative margin: widens a container's hit-test bounds by `slop`
 * on the given sides without moving anything on screen.
 */
export function slopBoundsStyle(slop: {
	top?: number;
	bottom?: number;
	left?: number;
	right?: number;
}) {
	const { top = 0, bottom = 0, left = 0, right = 0 } = slop;
	return {
		paddingTop: top,
		paddingBottom: bottom,
		paddingLeft: left,
		paddingRight: right,
		marginTop: -top,
		marginBottom: -bottom,
		marginLeft: -left,
		marginRight: -right,
	};
}

// Filter pill: 13pt system label (~16pt line) + 2x6 vertical padding + 2x1 border.
export const FILTER_PILL_PADDING_V = 6;
export const FILTER_PILL_HEIGHT = 16 + FILTER_PILL_PADDING_V * 2 + 2;
export const FILTER_PILL_HIT_SLOP = verticalHitSlop(FILTER_PILL_HEIGHT);

// Added-books sheet close / confirm buttons.
export const SHEET_ICON_BUTTON_SIZE = 36;
export const SHEET_ICON_BUTTON_HIT_SLOP = squareHitSlop(SHEET_ICON_BUTTON_SIZE);
