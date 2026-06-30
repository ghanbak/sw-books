import { FlashList } from '@shopify/flash-list';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoloCover } from '@/components/holo-cover';
import { TimelineRail } from '@/components/timeline-rail';
import { type FilterPillOption, FilterPills } from '@/components/ui/filter-pills';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import type { Book } from '@/lib/hooks';
import { useBooks } from '@/lib/hooks';
import { groupBooksByYear } from '@/lib/timeline';

type CanonFilter = 'all' | 'Canon' | 'Legends';

const CANON_OPTIONS: FilterPillOption<CanonFilter>[] = [
	{ key: 'all', label: 'All' },
	{ key: 'Canon', label: 'Canon' },
	{ key: 'Legends', label: 'Legends' },
];

const VIEW_CONFIG = { itemVisiblePercentThreshold: 60 } as const;

/**
 * Timeline tab — a horizontal, snap-paged scroll through the catalog in chronological
 * order (oldest -> newest), one hologram hero per book, with a notch rail below that
 * stays anchored on the current date as you page within a year.
 */
export default function TimelineScreen() {
	const { width } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	// Pager can't use a list header + contentInsetAdjustmentBehavior, so offset the body by the
	// full header height (not just insets.top) — that puts the filter pills below the large title,
	// matching Archives/Library. insets.top alone leaves them up in the nav-bar row.
	const headerHeight = useHeaderHeight();
	const { books } = useBooks();
	const [canonFilter, setCanonFilter] = useState<CanonFilter>('all');
	const [activePage, setActivePage] = useState(0);
	const [listHeight, setListHeight] = useState(0);

	const data = useMemo(() => {
		const filtered = canonFilter === 'all' ? books : books.filter((b) => b.canon === canonFilter);
		return groupBooksByYear(filtered);
	}, [books, canonFilter]);

	const activeGroup = data.pageToGroup[activePage] ?? 0;

	// Stable callback — FlashList rejects an onViewableItemsChanged that changes identity.
	const onViewableItemsChanged = useRef(
		({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
			const index = viewableItems[0]?.index;
			if (index != null) setActivePage(index);
		},
	).current;

	const coverW = Math.min(220, Math.round(width * 0.55));
	const coverH = Math.round(coverW * 1.5);

	const renderItem = useCallback(
		({ item }: { item: Book }) => (
			<View style={[styles.page, { width, height: listHeight }]}>
				<HoloCover
					variant="hero"
					tilt={false}
					coverUri={item.cover_image}
					title={item.title}
					author={item.author}
					width={coverW}
					height={coverH}
				/>
			</View>
		),
		[width, listHeight, coverW, coverH],
	);
	const keyExtractor = useCallback((item: Book) => item.id, []);

	return (
		<View style={[styles.container, { paddingTop: headerHeight, paddingBottom: insets.bottom }]}>
			<View style={styles.filters}>
				<FilterPills options={CANON_OPTIONS} value={canonFilter} onChange={setCanonFilter} />
			</View>

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
							<FlashList
								data={data.books}
								horizontal
								showsHorizontalScrollIndicator={false}
								snapToInterval={width}
								snapToAlignment="start"
								decelerationRate="fast"
								disableIntervalMomentum
								renderItem={renderItem}
								keyExtractor={keyExtractor}
								getItemType={() => 'page'}
								onViewableItemsChanged={onViewableItemsChanged}
								viewabilityConfig={VIEW_CONFIG}
							/>
						)}
					</View>
					<TimelineRail groups={data.groups} activeIndex={activeGroup} width={width} />
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
	filters: {
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	listWrap: {
		flex: 1,
	},
	page: {
		alignItems: 'center',
		justifyContent: 'center',
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
