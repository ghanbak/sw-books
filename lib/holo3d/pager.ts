/**
 * Pure layout math for the 3D hologram stage — no three.js, safe for Vitest (node).
 * Units are layout points unless noted; "card widths" = the 3D rig's unscaled unit (the
 * card is 1 × CARD_ASPECT card widths).
 */

export const CARD_ASPECT = 1.5;
export const CAMERA_FOV_DEG = 30;
export const CAMERA_Z = 5;
/** Max yaw of a card leaving centre (radians) — a slight carousel turn while paging. */
export const MAX_ROTATION_Y = 0.35;
/**
 * The full rig (card top → emitter + bloom) spans ≈ 2.15 card widths vertically, centred
 * ≈ 0.22 card widths below the card centre. Single-card stages lift the rig by this much so
 * card + beam + emitter sit centred in the canvas.
 */
export const RIG_HEIGHT = 2.15;
export const RIG_LIFT = 0.22;

export type CardTransform = {
	/** Horizontal offset of the card centre from the canvas centre, in points. */
	offset: number;
	rotationY: number;
	opacity: number;
	visible: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Where card `index` sits for a horizontal pager scrolled to `scrollX` (pages = `pageWidth`). */
export function cardTransform(index: number, scrollX: number, pageWidth: number): CardTransform {
	if (!(pageWidth > 0)) {
		const isFirst = index === 0;
		return { offset: 0, rotationY: 0, opacity: isFirst ? 1 : 0, visible: isFirst };
	}
	const offset = index * pageWidth - scrollX;
	const t = offset / pageWidth; // 0 = centred, ±1 = one page away
	const distance = Math.min(1, Math.abs(t));
	return {
		offset,
		rotationY: -clamp(t, -1, 1) * MAX_ROTATION_Y,
		opacity: 1 - distance * 0.5,
		visible: Math.abs(t) < 1.5,
	};
}

/** Nearest page for a scroll offset, clamped to the list. */
export function pageAt(scrollX: number, pageWidth: number, count: number): number {
	if (!(pageWidth > 0) || count <= 0) return 0;
	return clamp(Math.round(scrollX / pageWidth), 0, count - 1);
}

/** Page indices whose covers should be resident: `active` ± `radius`, clamped to the list. */
export function windowIndices(active: number, count: number, radius = 1): number[] {
	if (count <= 0) return [];
	const lo = clamp(active - radius, 0, count - 1);
	const hi = clamp(active + radius, 0, count - 1);
	const out: number[] = [];
	for (let i = lo; i <= hi; i++) out.push(i);
	return out;
}

export type Rect = { x: number; y: number; width: number; height: number };

/** A card of `cardW × cardH` centred in a `pageW × pageH` cell, optionally lifted (points). */
export function cardRect(
	pageW: number,
	pageH: number,
	cardW: number,
	cardH: number,
	lift = 0,
): Rect {
	return {
		x: (pageW - cardW) / 2,
		y: (pageH - cardH) / 2 - lift,
		width: cardW,
		height: cardH,
	};
}

/** World units per layout point at the card plane (z = 0) for a canvas `viewHeight` tall. */
export function worldPerPoint(
	viewHeight: number,
	fovDeg = CAMERA_FOV_DEG,
	distance = CAMERA_Z,
): number {
	if (!(viewHeight > 0)) return 0;
	const visibleHeight = 2 * distance * Math.tan(((fovDeg / 2) * Math.PI) / 180);
	return visibleHeight / viewHeight;
}

/** Largest card width (points) whose full rig fits a canvas `viewHeight` tall, capped at `max`. */
export function fitCardWidth(viewHeight: number, max: number): number {
	if (!(viewHeight > 0)) return 0;
	return Math.round(Math.min(max, viewHeight / RIG_HEIGHT));
}
