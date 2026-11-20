import { clampIndex, railTranslateX } from '@/lib/timeline';

/**
 * Screen-reader model for the Timeline rail: one `adjustable` element whose swipe
 * up/down steps one date. Pure so it unit-tests in the node vitest env.
 */

export const RAIL_A11Y_LABEL = 'Timeline';

export const RAIL_A11Y_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;

/**
 * The group an accessibility action should move to, or null when it's a no-op
 * (unknown action, empty rail, or already at that end — so no haptic or jump fires).
 */
export function railA11yStep(actionName: string, shownIndex: number, count: number): number | null {
	if (count <= 0) return null;
	const delta = actionName === 'increment' ? 1 : actionName === 'decrement' ? -1 : 0;
	if (delta === 0) return null;
	const next = clampIndex(shownIndex + delta, count);
	return next === shownIndex ? null : next;
}

/**
 * Whether a marker pill is on screen for the date the rail shows, so off-screen pills can
 * drop out of the VoiceOver / TalkBack focus order. `pillX` is the pill's row-local center
 * (as from `layoutAnchorPills`); the row sits at `railTranslateX(width, shownIndex)`.
 * `halfWidth` is half the pill's footprint: a pill counts while any of it overlaps
 * `[0, width]`, so a partly visible pill stays focusable.
 */
export function pillOnScreen(
	pillX: number,
	shownIndex: number,
	width: number,
	halfWidth: number,
): boolean {
	const screenX = pillX + railTranslateX(width, shownIndex);
	return screenX + halfWidth > 0 && screenX - halfWidth < width;
}
