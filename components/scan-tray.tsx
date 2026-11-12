import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
	type EntryAnimationsValues,
	LayoutAnimationConfig,
	type LayoutAnimation,
	LinearTransition,
	withSpring,
	withTiming,
} from 'react-native-reanimated';

import { BOOK_CARD_COVER } from '@/components/book-card';
import { HoloCover } from '@/components/holo-cover';
import { tokens } from '@/constants/tokens';
import { useReduceMotion, useReduceTransparency } from '@/hooks/useAccessibility';
import { bookRowLabel } from '@/lib/book-a11y';
import type { Book } from '@/lib/hooks';
import {
	TRAY_COVER_OPACITY,
	TRAY_DROP,
	TRAY_DROP_HEADROOM,
	TRAY_RAMP_LOCATIONS,
	TRAY_SHIFT_MS,
	TRAY_SPACING,
	trayCoverSize,
	trayHeight,
	trayMotion,
	traySkipsEntering,
	trayUsesBlur,
} from '@/lib/scan-tray';

const COVER = trayCoverSize(BOOK_CARD_COVER.width);
const TRAY_HEIGHT = trayHeight(COVER.height);

/**
 * Book-drop enter (#75): the cover grows from 0 while falling into its slot. Numeric
 * transform values only — never interpolate an animation return into a string.
 */
function trayDropIn(_values: EntryAnimationsValues): LayoutAnimation {
	'worklet';
	return {
		initialValues: {
			opacity: 0,
			transform: [{ translateY: TRAY_DROP.fromTranslateY }, { scale: TRAY_DROP.fromScale }],
		},
		animations: {
			opacity: withTiming(1, { duration: TRAY_DROP.fadeMs }),
			transform: [
				{ translateY: withSpring(0, TRAY_DROP.spring) },
				{ scale: withSpring(1, TRAY_DROP.spring) },
			],
		},
	};
}

const trayShift = LinearTransition.duration(TRAY_SHIFT_MS);

/**
 * Scanner V2 tray (#74/#75): the books captured so far, newest first (index 0 = left).
 * Each new book drops in from size 0 and its neighbours slide right. Covers use the
 * Archives-row HoloCover at 88×132 with slight transparency so the camera reads through,
 * over an eased scrim that runs from the screen bottom up to 8pt above the covers. Under the
 * scrim, a progressive blur (issue 294) follows the same ramp: clear at that edge, full strength by
 * the tray's bottom and on to the screen bottom. Reduce Transparency drops the blur and keeps
 * the scrim, which alone carries contrast for the covers and the Finish button.
 *
 * Presentational only: the scanner owns the list (dedupe, prepend). Render it above the
 * Finish button, before the button in the tree, inside a parent that does not clip, so the
 * scrim's tail extends behind the button to the screen bottom. Renders nothing when empty.
 */
export function ScanTray({ books }: { books: Book[] }) {
	const reduceMotion = useReduceMotion();
	const motion = trayMotion(reduceMotion);
	const showBlur = trayUsesBlur(useReduceTransparency());
	const { height: windowHeight } = useWindowDimensions();
	const scrollRef = useRef<ScrollView>(null);
	const newestId = books[0]?.id;
	// LayoutAnimationConfig reads skipEntering only when it mounts, and it mounts with the first
	// book (the tray renders null while empty). Skip only for books present at the tray's own
	// mount; once emptied, the next first book must drop in.
	const booksAtMount = useRef(books.length).current;
	const emptiedSinceMount = useRef(false);
	if (books.length === 0) emptiedSinceMount.current = true;
	const skipEntering = traySkipsEntering(booksAtMount, emptiedSinceMount.current);

	// Bring the newest cover into view when one is prepended while the user is scrolled right.
	useEffect(() => {
		if (newestId == null) return;
		scrollRef.current?.scrollTo({ x: 0, animated: motion.animateScroll });
	}, [newestId, motion.animateScroll]);

	if (books.length === 0) return null;

	return (
		<View style={styles.tray}>
			<View
				pointerEvents="none"
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
				style={[styles.scrim, { bottom: -windowHeight }]}
			>
				{showBlur ? (
					<MaskedView
						style={StyleSheet.absoluteFill}
						maskElement={
							<View style={styles.blurMask}>
								<LinearGradient
									colors={[
										tokens.scanTray.blurMaskClear,
										tokens.scanTray.blurMaskLow,
										tokens.scanTray.blurMaskMid,
										tokens.scanTray.blurMaskFull,
									]}
									locations={TRAY_RAMP_LOCATIONS}
									style={styles.scrimRamp}
								/>
								<View style={styles.blurMaskTail} />
							</View>
						}
					>
						<BlurView
							intensity={tokens.scanTray.blurIntensity}
							tint={tokens.scanTray.blurTint}
							style={StyleSheet.absoluteFill}
						/>
					</MaskedView>
				) : null}
				<LinearGradient
					colors={[
						tokens.scanTray.scrimClear,
						tokens.scanTray.scrimLow,
						tokens.scanTray.scrimMid,
						tokens.scanTray.scrimFull,
					]}
					locations={TRAY_RAMP_LOCATIONS}
					style={styles.scrimRamp}
				/>
				<View style={styles.scrimTail} />
			</View>
			<ScrollView
				ref={scrollRef}
				horizontal
				showsHorizontalScrollIndicator={false}
				accessibilityRole="list"
				accessibilityLabel="Scanned books"
				style={styles.scroll}
				contentContainerStyle={styles.content}
			>
				{/* Books already in the list when the tray mounts appear in place; only new ones drop in. */}
				<LayoutAnimationConfig skipEntering={skipEntering}>
					{books.map((book) => (
						<Animated.View
							key={book.id}
							entering={motion.animateEnter ? trayDropIn : undefined}
							layout={motion.animateShift ? trayShift : undefined}
							accessible
							accessibilityRole="image"
							accessibilityLabel={bookRowLabel(book)}
							style={styles.item}
						>
							{/* Opacity on an inner view: the enter animation owns the outer view's opacity. */}
							<View style={styles.cover}>
								<HoloCover
									coverUri={book.cover_image}
									title={book.title}
									author={book.author}
									width={COVER.width}
									height={COVER.height}
								/>
							</View>
						</Animated.View>
					))}
				</LayoutAnimationConfig>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	tray: {
		height: TRAY_HEIGHT,
	},
	// Covers the tray from its top edge (8pt above the covers) and runs past the screen bottom.
	scrim: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
	},
	scrimRamp: {
		height: TRAY_HEIGHT,
	},
	scrimTail: {
		flex: 1,
		backgroundColor: tokens.scanTray.scrimFull,
	},
	// The mask mirrors the scrim's ramp + tail; only its alpha matters.
	blurMask: {
		flex: 1,
	},
	blurMaskTail: {
		flex: 1,
		backgroundColor: tokens.scanTray.blurMaskFull,
	},
	// iOS ScrollViews clip regardless of overflow, so the drop's 24pt of travel lives inside the
	// content as headroom; the negative margin keeps the covers 8pt below the scrim edge.
	scroll: {
		marginTop: -TRAY_DROP_HEADROOM,
		overflow: 'visible',
	},
	content: {
		paddingTop: TRAY_DROP_HEADROOM + TRAY_SPACING.top,
		paddingBottom: TRAY_SPACING.bottom,
		paddingHorizontal: TRAY_SPACING.side,
		gap: TRAY_SPACING.gap,
	},
	item: {
		width: COVER.width,
		height: COVER.height,
	},
	cover: {
		opacity: TRAY_COVER_OPACITY,
	},
});
