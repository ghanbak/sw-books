import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BookCard } from '@/components/book-card';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { TabHeaderActions } from '@/components/tab-header-actions';
import { FilterPills } from '@/components/ui/filter-pills';
import { tokens } from '@/constants/tokens';
import { useCatalogSort } from '@/hooks/useCatalogSort';
import {
	ARCHIVE_CANON_OPTIONS,
	ARCHIVE_TYPE_OPTIONS,
	type ArchiveFilters,
	type CanonFilter,
	DEFAULT_ARCHIVE_FILTERS,
	type TypeFilter,
	filterArchiveBooks,
} from '@/lib/archive-filters';
import type { Book } from '@/lib/hooks';
import { useBooks, useUserBooks } from '@/lib/hooks';
import { shelfStatesByBook } from '@/lib/shelf-state';

export default function CatalogScreen() {
	const { books, loading, error, refetch } = useBooks();
	const [filters, setFilters] = useState<ArchiveFilters>(DEFAULT_ARCHIVE_FILTERS);
	const setCanon = useCallback((canon: CanonFilter) => setFilters((f) => ({ ...f, canon })), []);
	const setType = useCallback((type: TypeFilter) => setFilters((f) => ({ ...f, type })), []);
	const { sort, selectSort } = useCatalogSort('@ossus/catalog_sort');

	const filteredBooks = useMemo(
		() => filterArchiveBooks(books, filters, sort),
		[books, filters, sort],
	);

	// Shelf state once per list; equal states share one object, so a toggle re-renders only its row.
	const { userBooks } = useUserBooks();
	const shelfByBook = useMemo(() => shelfStatesByBook(userBooks), [userBooks]);

	const renderItem = useCallback(
		({ item }: { item: Book }) => <BookCard book={item} shelf={shelfByBook.get(item.id)} />,
		[shelfByBook],
	);
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
		<EmptyState message="No books found." />
	);

	// The FlashList is the screen's direct first child + contentInsetAdjustmentBehavior="automatic" so the
	// native large title collapses on scroll and the header/tab-bar insets are applied natively. FlashList
	// v2 renders a plain wrapper View whose first subview is its ScrollView, so the scroll view stays on
	// the first-descendant chain the native header tracks; the inset prop passes through to that
	// ScrollView. Rows are recycled — HoloCover's per-row state is keyed to the cover URI.
	return (
		<>
			<TabHeaderActions sort={sort} onSortChange={selectSort} />
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
						<FilterPills
							options={ARCHIVE_CANON_OPTIONS}
							value={filters.canon}
							onChange={setCanon}
						/>
						<FilterPills options={ARCHIVE_TYPE_OPTIONS} value={filters.type} onChange={setType} />
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
		// Each pill row's vertical hitSlop is 7pt; 16 keeps the two rows' tap areas from overlapping.
		gap: 16,
	},
});
