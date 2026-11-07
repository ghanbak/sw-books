import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BookCard } from '@/components/book-card';
import { ErrorState } from '@/components/error-state';
import { TabHeaderActions } from '@/components/tab-header-actions';
import { type FilterPillOption, FilterPills } from '@/components/ui/filter-pills';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { useCatalogSort } from '@/hooks/useCatalogSort';
import type { Book } from '@/lib/hooks';
import { useBooks } from '@/lib/hooks';
import { sortBooks } from '@/lib/sort';

type CanonFilter = 'all' | 'Canon' | 'Legends';

const CANON_OPTIONS: FilterPillOption<CanonFilter>[] = [
	{ key: 'all', label: 'All' },
	{ key: 'Canon', label: 'Canon' },
	{ key: 'Legends', label: 'Legends' },
];

export default function CatalogScreen() {
	const { books, loading, error, refetch } = useBooks();
	const [canonFilter, setCanonFilter] = useState<CanonFilter>('all');
	const { sort, openSortMenu } = useCatalogSort('@ossus/catalog_sort');

	const filteredBooks = useMemo(() => {
		const result = canonFilter === 'all' ? books : books.filter((b) => b.canon === canonFilter);
		return sortBooks(result, sort);
	}, [books, canonFilter, sort]);

	const renderItem = useCallback(({ item }: { item: Book }) => <BookCard book={item} />, []);
	const keyExtractor = useCallback((item: Book) => item.id, []);

	// Loading/error/empty render as the list's ListEmptyComponent on an always-mounted FlashList —
	// a scroll view that mounts AFTER a placeholder View stalls native large-title collapse (rn-screens#2871).
	const listEmpty = loading ? (
		<View style={styles.center}>
			<ActivityIndicator size="large" color={tokens.accent.primary} />
		</View>
	) : error ? (
		<ErrorState title="Couldn't load the archive" message={error} onRetry={refetch} />
	) : (
		<View style={styles.center}>
			<Text style={styles.emptyText}>No books found.</Text>
		</View>
	);

	// The FlashList is the screen's direct first child + contentInsetAdjustmentBehavior="automatic" so the
	// native large title collapses on scroll and the header/tab-bar insets are applied natively. FlashList
	// v2 renders a plain wrapper View whose first subview is its ScrollView, so the scroll view stays on
	// the first-descendant chain the native header tracks; the inset prop passes through to that
	// ScrollView. Rows are recycled — HoloCover's per-row state is keyed to the cover URI.
	return (
		<>
			<TabHeaderActions showFilter onFilter={openSortMenu} />
			<FlashList
				style={styles.list}
				contentContainerStyle={filteredBooks.length === 0 ? styles.emptyContent : undefined}
				data={filteredBooks}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				contentInsetAdjustmentBehavior="automatic"
				refreshing={loading}
				onRefresh={refetch}
				ListHeaderComponent={
					<View style={styles.controls}>
						<FilterPills options={CANON_OPTIONS} value={canonFilter} onChange={setCanonFilter} />
					</View>
				}
				ListEmptyComponent={listEmpty}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	list: {
		flex: 1,
		backgroundColor: tokens.surface.background,
	},
	emptyContent: {
		flexGrow: 1,
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	controls: {
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	emptyText: {
		fontSize: 15,
		color: tokens.text.hint,
	},
});
