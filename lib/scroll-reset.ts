/**
 * Scroll-to-top on a key change (Search: a new query) for a list using
 * `contentInsetAdjustmentBehavior="automatic"` under a translucent large-title header.
 *
 * There the resting top is a negative offset (-adjustedContentInset.top), which RN doesn't expose,
 * and `scrollToOffset({ offset: 0 })` would tuck content under the header. So the tracker learns
 * the top from scroll events: until the user first drags, every offset change is UIKit placing the
 * list at rest, and the lowest one is the top. Once they drag, bounce overscroll could go lower,
 * so the value is frozen. No events at all (Android, or no inset) falls back to 0.
 *
 * Pure (no React) so the decisions unit-test in the node vitest env; `useScrollResetOnChange`
 * wires it to a list ref.
 */

/** Within this many points of the top, the list is already there: don't scroll (no jump). */
export const SCROLL_TOP_TOLERANCE = 1;

/** The lowest offset seen before the first drag, or `prevTop` unchanged once the user has dragged. */
export function trackRestingTop(
	prevTop: number | null,
	y: number,
	userHasDragged: boolean,
): number | null {
	if (userHasDragged) return prevTop;
	return prevTop === null ? y : Math.min(prevTop, y);
}

/** Where to scroll on reset, or null to stay put (never scrolled, or already at the top). */
export function scrollResetTarget(offset: number | null, top: number | null): number | null {
	if (offset === null) return null;
	const target = top ?? 0;
	return offset - target > SCROLL_TOP_TOLERANCE ? target : null;
}

/** Reset only when the key actually changed (not on mount, not on a re-render with the same key). */
export function shouldResetScroll(prevKey: string, nextKey: string): boolean {
	return prevKey !== nextKey;
}

/** The slice of a FlashList/FlatList ref the reset needs. */
export type ScrollResetList = {
	scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
};

export function createScrollResetTracker() {
	let top: number | null = null;
	let offset: number | null = null;
	let dragged = false;
	return {
		onScroll(y: number) {
			offset = y;
			top = trackRestingTop(top, y, dragged);
		},
		onScrollBeginDrag() {
			dragged = true;
		},
		/** Scrolls `list` to the resting top if it isn't there. Returns whether it scrolled. */
		reset(list: ScrollResetList | null | undefined): boolean {
			const target = scrollResetTarget(offset, top);
			if (target === null || !list) return false;
			// Not animated: it fires per keystroke, and the content under it was just replaced.
			list.scrollToOffset({ offset: target, animated: false });
			offset = target;
			return true;
		},
	};
}
