import { type RefObject, useCallback, useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import {
	type ScrollResetList,
	createScrollResetTracker,
	shouldResetScroll,
} from '@/lib/scroll-reset';

/**
 * Scrolls `listRef` back to its resting top whenever `resetKey` changes, respecting the
 * automatic content inset (see lib/scroll-reset.ts). Spread the returned props onto the list:
 * the scroll handlers teach it where the top is, and `scrollToOverflowEnabled` lets iOS accept
 * that negative offset (RN otherwise clamps programmatic scrolls to y >= 0).
 */
export function useScrollResetOnChange(
	listRef: RefObject<ScrollResetList | null>,
	resetKey: string,
) {
	const tracker = useRef(createScrollResetTracker()).current;
	const prevKey = useRef(resetKey);

	useEffect(() => {
		if (!shouldResetScroll(prevKey.current, resetKey)) return;
		prevKey.current = resetKey;
		tracker.reset(listRef.current);
	}, [resetKey, listRef, tracker]);

	const onScroll = useCallback(
		(e: NativeSyntheticEvent<NativeScrollEvent>) => tracker.onScroll(e.nativeEvent.contentOffset.y),
		[tracker],
	);
	const onScrollBeginDrag = useCallback(() => tracker.onScrollBeginDrag(), [tracker]);

	return { onScroll, onScrollBeginDrag, scrollToOverflowEnabled: true } as const;
}
