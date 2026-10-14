import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { TIMELINE_ANCHORS, layoutAnchorPills } from '@/lib/timeline-anchors';

// Wide enough for the longest (24-char) pill label.
const PILL_SLOT_W = 180;
// One stacked row of marker pills, and the gap between the lowest row and the notches.
const PILL_ROW_H = 22;
const STEM_GAP = 4;

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
	// What the rail SHOWS (active notch, date label, which markers get names). Mirrors the
	// scrub/tap target immediately — the pager's viewability callback lags behind a drag, so
	// following activeIndex alone left the label frozen on the starting date until release.
	const [targetIndex, setTargetIndex] = useState<number | null>(null);
	const shownIndex = targetIndex ?? activeIndex;
	const active = groups[shownIndex];

	// Paging mode: follow the pager, unless the finger (or a pending scrub target) owns the rail.
	useEffect(() => {
		if (scrubbing.value) return;
		if (pendingIndex.current !== null) {
			// translateX is already where the scrub put it; just wait for the pager to agree.
			if (activeIndex === pendingIndex.current) {
				pendingIndex.current = null;
				setTargetIndex(null);
			}
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
			setTargetIndex(index);
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

	// Film/TV marker pills on the same index-spaced axis as the notches, riding the one
	// shared translateX. Stacked into rows where they'd overlap (see layoutAnchorPills);
	// the layout is date-independent, so pills don't reshuffle while scrubbing.
	const anchorLayout = useMemo(() => layoutAnchorPills(TIMELINE_ANCHORS, groups), [groups]);

	return (
		<View style={styles.wrap}>
			<View style={styles.ticksBlock}>
				{/* Pills float upward from the notches into the empty space under the cover, so
				    the stack costs no layout height; each has a stem down to its date. */}
				<View
					pointerEvents="none"
					style={[styles.anchorsArea, { height: anchorLayout.rows * PILL_ROW_H + STEM_GAP }]}
				>
					<Animated.View style={[styles.anchorRow, rowStyle]}>
						{/* Two passes: all stems first, then all pills, so a stem never draws over a
						    neighboring pill. */}
						{anchorLayout.pills.map((p) => (
							<View
								key={`stem-${p.key}`}
								style={[
									styles.stem,
									{ left: p.x - 0.5, height: p.row * PILL_ROW_H + STEM_GAP + 1 },
								]}
							/>
						))}
						{anchorLayout.pills.map((p) => (
							<View
								key={p.key}
								style={[
									styles.pillSlot,
									{ left: p.x - PILL_SLOT_W / 2, bottom: p.row * PILL_ROW_H + STEM_GAP },
								]}
							>
								<View style={styles.pill}>
									<SymbolView
										name={p.kind === 'film' ? 'film' : 'tv'}
										size={10}
										tintColor={tokens.text.secondary}
										weight="semibold"
									/>
									<Text style={styles.pillLabel} numberOfLines={1}>
										{p.label}
									</Text>
								</View>
							</View>
						))}
					</Animated.View>
				</View>
				<GestureDetector gesture={Gesture.Race(pan, tap)}>
					<View style={styles.ticksWindow}>
						<Animated.View style={[styles.row, rowStyle]}>
							{groups.map((g, i) => (
								<View key={g.order} style={styles.slot}>
									<View style={i === shownIndex ? styles.tickActive : styles.tick} />
								</View>
							))}
						</Animated.View>
					</View>
				</GestureDetector>
			</View>
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
	ticksBlock: {
		width: '100%',
	},
	// Film/TV marker pills: sit directly on top of the notches (bottom: 100% of ticksBlock) and
	// grow upward over the pager's empty space instead of taking layout height.
	anchorsArea: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: '100%',
	},
	anchorRow: {
		position: 'absolute',
		left: 0,
		top: 0,
		bottom: 0,
	},
	stem: {
		position: 'absolute',
		bottom: 0,
		width: 1,
		backgroundColor: tokens.rail.anchorStem,
	},
	// Fixed-width slot centered on the marker's x; the pill centers itself inside it, so
	// no measurement pass is needed to center a pill of unknown width.
	pillSlot: {
		position: 'absolute',
		width: PILL_SLOT_W,
		height: PILL_ROW_H,
		alignItems: 'center',
		justifyContent: 'center',
	},
	pill: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 3,
		height: 18,
		paddingHorizontal: 6,
		borderRadius: 9,
		backgroundColor: tokens.rail.anchorPill,
	},
	pillLabel: {
		fontSize: 10,
		fontWeight: '600',
		color: tokens.text.secondary,
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
