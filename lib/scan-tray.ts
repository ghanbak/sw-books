/**
 * Pure geometry and motion decisions for the scan tray (components/scan-tray.tsx, #75).
 * Kept free of React Native imports so they unit-test in the node vitest env.
 */

/** Owner cap (#74): tray covers are never wider than 200pt. */
export const TRAY_COVER_MAX_WIDTH = 200;

/** Slight transparency so the camera reads through the covers. */
export const TRAY_COVER_OPACITY = 0.88;

/** Tray spacing (8pt grid). `top` is the 8pt band between the scrim's clear edge and the covers. */
export const TRAY_SPACING = { top: 8, bottom: 16, side: 16, gap: 8 } as const;

/** Book-drop enter: grows from 0 while falling 24pt into its slot. */
export const TRAY_DROP = {
	fromScale: 0,
	fromTranslateY: -24,
	fadeMs: 120,
	spring: { damping: 18, stiffness: 240, mass: 1 },
} as const;

/**
 * Room above the slot inside the scroll content so the drop's first frames (24pt above the
 * cover) are drawn inside the ScrollView's bounds. The ScrollView is pulled up by the same
 * amount, so the covers stay 8pt below the scrim's clear edge.
 */
export const TRAY_DROP_HEADROOM = -TRAY_DROP.fromTranslateY;

/**
 * Whether the tray's LayoutAnimationConfig should skip entering. Only books already present
 * when the tray first mounts appear in place; a tray that mounted empty (every scan session)
 * or has since been emptied must let the next book play the drop.
 */
export function traySkipsEntering(booksAtMount: number, emptiedSinceMount: boolean): boolean {
	return booksAtMount > 0 && !emptiedSinceMount;
}

/** Neighbours sliding right to make room for the newest cover. */
export const TRAY_SHIFT_MS = 240;

/** 2:3 cover at `width`, capped at TRAY_COVER_MAX_WIDTH, whole points. */
export function trayCoverSize(width: number): { width: number; height: number } {
	const w = Math.max(0, Math.min(Math.round(width), TRAY_COVER_MAX_WIDTH));
	return { width: w, height: Math.round(w * 1.5) };
}

/** Full tray height: top band + cover + bottom padding. The scrim's gradient spans this. */
export function trayHeight(coverHeight: number): number {
	return TRAY_SPACING.top + coverHeight + TRAY_SPACING.bottom;
}

/**
 * Gradient stops shared by the scrim and the blur mask, over the tray's height: 0 is the
 * tray's top edge (TRAY_SPACING.top above the covers, fully clear), 1 the tray's bottom,
 * from where both hold at full strength to the screen bottom.
 */
export const TRAY_RAMP_LOCATIONS = [0, 0.3, 0.65, 1] as const;

/**
 * Whether the tray draws its progressive blur (#294). Reduce Transparency keeps the scrim
 * only. Callers pass `true` until the setting resolves, so the blur never flashes on.
 */
export function trayUsesBlur(reduceTransparency: boolean): boolean {
	return !reduceTransparency;
}

/**
 * Which tray motions run. Reduce Motion skips the scale-in drop and the neighbour shift
 * (books appear in place) and jumps the scroll back to the newest cover instead of gliding.
 * Transparency and the scrim are static, so they are unchanged.
 */
export function trayMotion(reduceMotion: boolean): {
	animateEnter: boolean;
	animateShift: boolean;
	animateScroll: boolean;
} {
	const on = !reduceMotion;
	return { animateEnter: on, animateShift: on, animateScroll: on };
}
