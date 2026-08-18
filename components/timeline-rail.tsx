import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import {
	RAIL_PITCH,
	type TimelineGroup,
	clampIndex,
	indexAtScreenX,
	railTranslateX,
} from '@/lib/timeline';

/**
 * The notch rail beneath the Timeline hero. One tick per year-with-books, evenly
 * spaced (index-spaced, not to-scale — gaps between dates can be millennia). The
 * active group's tick is tall + blue and carries the date label; the row is
 * translated so the active tick stays centered as you page.
 *
 * The rail is also the timeline's fast-navigation surface: tap a notch to jump to it,
 * or drag to scrub continuously (one selection haptic per date crossed).
 */
export function TimelineRail({
	groups,
	activeIndex,
	width,
	onJump,
}: {
	groups: TimelineGroup[];
	activeIndex: number;
	width: number;
	/** Jump the pager to a page — fired when the user taps or scrubs the rail. */
	onJump: (page: number) => void;
}) {
	const active = groups[activeIndex];
	const count = groups.length;

	const translateX = useSharedValue(railTranslateX(width, activeIndex));
	// True while the finger owns the rail. Written on the UI thread, read on both.
	const scrubbing = useSharedValue(false);
	const startTx = useSharedValue(0);
	// Last group the scrub crossed — coalesces haptics + pager scrolls to one per crossing.
	const lastGroup = useSharedValue(activeIndex);
	// The group the rail is driving the pager toward. While set (and not yet reflected in
	// activeIndex), the paging effect must not write translateX — otherwise a late
	// viewability callback from a scrub-driven scroll yanks the rail back (the jitter the
	// scrubbing flag alone can't prevent, since it clears before that callback lands).
	const pendingIndex = useRef<number | null>(null);
	const [isScrubbing, setIsScrubbing] = useState(false);

	// Paging mode: follow the pager, unless the finger (or a pending scrub target) owns the rail.
	useEffect(() => {
		if (scrubbing.value) return;
		if (pendingIndex.current !== null) {
			// translateX is already where the scrub put it; just wait for the pager to agree.
			if (activeIndex === pendingIndex.current) pendingIndex.current = null;
			return;
		}
		lastGroup.value = activeIndex;
		translateX.value = withTiming(railTranslateX(width, activeIndex), { duration: 220 });
	}, [activeIndex, width, translateX, scrubbing, lastGroup]);

	// Drive the pager to a group (JS thread): remember the target, buzz, scroll.
	const driveTo = useCallback(
		(index: number) => {
			const group = groups[index];
			if (!group) return;
			pendingIndex.current = index;
			Haptics.selectionAsync();
			onJump(group.firstPage);
		},
		[groups, onJump],
	);

	// Rail travel limits — keep the first and last notch reachable, nothing beyond.
	const maxTx = railTranslateX(width, 0);
	const minTx = railTranslateX(width, Math.max(0, count - 1));
	const centerX = width / 2;

	const pan = Gesture.Pan()
		.onBegin(() => {
			scrubbing.value = true;
			startTx.value = translateX.value;
			runOnJS(setIsScrubbing)(true);
		})
		.onUpdate((e) => {
			const next = startTx.value + e.translationX;
			translateX.value = Math.min(Math.max(next, minTx), maxTx);
			// Clamp the DERIVED index too — rounding at a clamped extreme can otherwise land
			// outside [0, count-1] and throw inside scrollToIndex.
			const g = clampIndex(Math.round(indexAtScreenX(centerX, translateX.value)), count);
			if (g !== lastGroup.value) {
				lastGroup.value = g;
				runOnJS(driveTo)(g);
			}
		})
		.onEnd(() => {
			// Snap the rail to the notch that ended up centered, and make sure the pager agrees.
			const g = clampIndex(Math.round(indexAtScreenX(centerX, translateX.value)), count);
			translateX.value = withTiming(railTranslateX(width, g), { duration: 160 });
			lastGroup.value = g;
			runOnJS(driveTo)(g);
		})
		.onFinalize(() => {
			scrubbing.value = false;
			runOnJS(setIsScrubbing)(false);
		});

	// Tap a notch to jump straight to it.
	const tap = Gesture.Tap().onEnd((e) => {
		const g = clampIndex(Math.round(indexAtScreenX(e.x, translateX.value)), count);
		runOnJS(driveTo)(g);
	});

	const rowStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
	}));

	return (
		<View style={styles.wrap}>
			<GestureDetector gesture={Gesture.Race(pan, tap)}>
				<View style={styles.ticksWindow}>
					<Animated.View style={[styles.row, rowStyle]}>
						{groups.map((g, i) => (
							<View key={g.order} style={styles.slot}>
								<View style={i === activeIndex ? styles.tickActive : styles.tick} />
							</View>
						))}
					</Animated.View>
				</View>
			</GestureDetector>
			{active && (
				<Text style={[styles.label, isScrubbing && styles.labelScrubbing]}>{active.label}</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		paddingVertical: 12,
		alignItems: 'center',
		gap: 8,
	},
	ticksWindow: {
		width: '100%',
		height: 32,
		overflow: 'hidden',
		justifyContent: 'center',
	},
	row: {
		position: 'absolute',
		left: 0,
		flexDirection: 'row',
		alignItems: 'center',
	},
	slot: {
		width: RAIL_PITCH,
		alignItems: 'center',
	},
	tick: {
		width: 3,
		height: 12,
		borderRadius: 2,
		backgroundColor: tokens.text.hint,
	},
	tickActive: {
		width: 4,
		height: 28,
		borderRadius: 2,
		backgroundColor: tokens.accent.primary,
	},
	label: {
		fontSize: 13,
		fontWeight: '600',
		color: tokens.text.secondary,
		fontVariant: ['tabular-nums'],
	},
	// Emphasized while scrubbing so the date you're landing on is easy to read mid-drag.
	labelScrubbing: {
		fontSize: 17,
		color: tokens.text.primary,
	},
});
