import { clampIndex } from '@/lib/timeline';

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
