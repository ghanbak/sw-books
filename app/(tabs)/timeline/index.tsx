import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	Pressable,
	StyleSheet,
	View,
	useWindowDimensions,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoloFace } from '@/components/holo-cover';
import { HoloStage, type StageBook } from '@/components/holo-stage';
import { TabHeaderActions } from '@/components/tab-header-actions';
import { TimelineRail } from '@/components/timeline-rail';
import { CanonBadge } from '@/components/ui/canon-badge';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { getCoverColor } from '@/lib/cover';
import { cardRect } from '@/lib/holo3d/pager';
import { useHoloStatus } from '@/lib/holo3d/status';
import type { Book } from '@/lib/hooks';
import { useBooks } from '@/lib/hooks';
import { groupBooksByYear } from '@/lib/timeline';

const VIEW_CONFIG = { itemVisiblePercentThreshold: 60 } as const;
const PAGER_OVERRIDES = { style: { overflow: 'visible' } } as const;
/** Vertical space the 3D rig needs, in card widths, when the card is centred (no lift). */
const PAGER_RIG_HEIGHT = 2.4;

/**
 * Timeline tab — a horizontal, snap-paged scroll through the catalog in chronological
 * order (oldest -> newest), with a notch rail below that stays anchored on the current date
 * as you page within a year.
 *
 * The heroes are ONE 3D WebGPU stage behind the pager (components/holo-stage.tsx): the pages
 * themselves are transparent tappable cells (badge, no-cover title, VoiceOver) whose card
 * rect lines up with the 3D card the stage draws from the scroll offset. Until the stage's
 * first frame — or when 3D is unavailable — each cell shows the static HoloFace instead.
 */
export default function TimelineScreen() {
	const { width } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const router = useRouter();
	// Pager can't use a list header + contentInsetAdjustmentBehavior, so offset the body by the
	// full header height (not just insets.top) — matching Archives/Library. insets.top alone
	// leaves the content up in the nav-bar row.
	const headerHeight = useHeaderHeight();
	const { books } = useBooks();
	const [activePage, setActivePage] = useState(0);
	const [listHeight, setListHeight] = useState(0);
	const [stageReady, setStageReady] = useState(false);
	const [pressedPage, setPressedPage] = useState<number | null>(null);
	const listRef = useRef<FlashListRef<Book>>(null);
	const scrollX = useSharedValue(0);
	const holoStatus = useHoloStatus();
	const show3D = holoStatus.kind === 'available' && stageReady;

	// The Timeline shows the whole chronology — canon/legends is signalled per-hero by a
	// corner badge, not filtered (focused canon filtering lives on Archives/Search).
	const data = useMemo(() => groupBooksByYear(books), [books]);

	const stageBooks = useMemo<StageBook[]>(
		() =>
			data.books.map((b) => ({
				key: b.id,
				coverUri: b.cover_image,
				fallbackColor: getCoverColor(b.title),
			})),
		[data.books],
	);

	const activeGroup = data.pageToGroup[activePage] ?? 0;

	// Stable callback — FlashList rejects an onViewableItemsChanged that changes identity.
	const onViewableItemsChanged = useRef(
		({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
			const index = viewableItems[0]?.index;
			if (index != null) setActivePage(index);
		},
	).current;

	// Fit the card so the whole rig (card + beam + emitter + glow) fits the pager height.
	const coverW = Math.round(
		Math.min(220, width * 0.55, listHeight > 0 ? listHeight / PAGER_RIG_HEIGHT : 220),
	);
	const coverH = Math.round(coverW * 1.5);
	const rect = cardRect(width, listHeight, coverW, coverH);

	const onScroll = useCallback(
		(e: NativeSyntheticEvent<NativeScrollEvent>) => {
			scrollX.set(e.nativeEvent.contentOffset.x);
		},
		[scrollX],
	);

	const renderItem = useCallback(
		({ item, index }: { item: Book; index: number }) => (
			<View style={{ width, height: listHeight }}>
				<Pressable
					style={[styles.card, { left: rect.x, top: rect.y, width: coverW, height: coverH }]}
					onPress={() => router.push(`/book/${item.id}`)}
					onPressIn={() => setPressedPage(index)}
					onPressOut={() => setPressedPage(null)}
					accessibilityRole="button"
					accessibilityLabel={`${item.title} by ${item.author.join(', ')}`}
				>
					{show3D ? (
						<>
							{item.cover_image ? null : (
								<View style={styles.noCover}>
									<Text numberOfLines={3} style={styles.noCoverTitle}>
										{item.title}
									</Text>
									<Text numberOfLines={1} style={styles.noCoverAuthor}>
										{item.author.join(', ')}
									</Text>
								</View>
							)}
							<CanonBadge canon={item.canon} style={styles.badge} />
						</>
					) : (
						<HoloFace
							coverUri={item.cover_image}
							title={item.title}
							author={item.author}
							canon={item.canon}
							width={coverW}
							height={coverH}
						/>
					)}
				</Pressable>
			</View>
		),
		[width, listHeight, rect.x, rect.y, coverW, coverH, show3D, router],
	);
	const keyExtractor = useCallback((item: Book) => item.id, []);

	// Tapping or scrubbing the rail moves the pager to that group's first book. Not animated:
	// a scrub fires this on every date crossed, and queued scroll animations would lag behind
	// the finger (and an animated jump across millennia is a long blur, not a transition).
	// scrollToOffset, not scrollToIndex: every page is exactly one screen wide, so the offset
	// is exact — scrollToIndex estimates the position of pages FlashList hasn't measured yet,
	// and a fast scrub to a far date could land several pages off.
	const handleJump = useCallback(
		(page: number) => {
			listRef.current?.scrollToOffset({ offset: page * width, animated: false });
		},
		[width],
	);

	return (
		<View style={[styles.container, { paddingTop: headerHeight, paddingBottom: insets.bottom }]}>
			<TabHeaderActions />

			{data.books.length === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyText}>No books with a known place on the timeline yet.</Text>
				</View>
			) : (
				<>
					<View
						style={styles.listWrap}
						onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
					>
						{listHeight > 0 && (
							<>
								<HoloStage
									mode="pager"
									books={stageBooks}
									cardWidth={coverW}
									pixelRatioCap={1.5}
									activePage={activePage}
									pageWidth={width}
									scrollX={scrollX}
									pressedPage={pressedPage}
									onReadyChange={setStageReady}
								/>
								<FlashList
									ref={listRef}
									// UIScrollView clips to its bounds by default (RN maps `overflow` to
									// clipsToBounds), cutting the hologram's bloom off at the pager's edges.
									// FlashList wraps the scroll view in its own (overflow: hidden) view, so
									// both need it: `style` reaches the wrapper, overrideProps the scroll view.
									style={styles.pager}
									overrideProps={PAGER_OVERRIDES}
									data={data.books}
									horizontal
									showsHorizontalScrollIndicator={false}
									snapToInterval={width}
									snapToAlignment="start"
									decelerationRate="fast"
									disableIntervalMomentum
									// Feeds the 3D stage's card positions (read by its frame loop).
									onScroll={onScroll}
									scrollEventThrottle={16}
									renderItem={renderItem}
									keyExtractor={keyExtractor}
									getItemType={() => 'page'}
									onViewableItemsChanged={onViewableItemsChanged}
									viewabilityConfig={VIEW_CONFIG}
								/>
							</>
						)}
					</View>
					<TimelineRail
						groups={data.groups}
						activeIndex={activeGroup}
						width={width}
						onJump={handleJump}
					/>
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.surface.background,
	},
	listWrap: {
		flex: 1,
	},
	pager: {
		overflow: 'visible',
	},
	card: {
		position: 'absolute',
	},
	badge: {
		position: 'absolute',
		top: 8,
		left: 8,
	},
	noCover: {
		position: 'absolute',
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 12,
	},
	noCoverTitle: {
		color: tokens.text.primary,
		fontWeight: '700',
		textAlign: 'center',
		fontSize: 13,
	},
	noCoverAuthor: {
		color: tokens.text.secondary,
		textAlign: 'center',
		fontSize: 10,
		marginTop: 4,
	},
	empty: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 32,
	},
	emptyText: {
		fontSize: 14,
		color: tokens.text.secondary,
		textAlign: 'center',
	},
});
