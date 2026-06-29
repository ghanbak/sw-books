import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCard } from '@/components/book-card';
import { ErrorState } from '@/components/error-state';
import { TabHeaderActions } from '@/components/tab-header-actions';
import { type FilterPillOption, FilterPills } from '@/components/ui/filter-pills';
import { tokens } from '@/constants/tokens';
import { useCatalogSort } from '@/hooks/useCatalogSort';
import type { Book } from '@/lib/hooks';
import { useBooks, useUserBooks } from '@/lib/hooks';
import { type LibraryFilter, deriveLibraryFilter } from '@/lib/library-filter';
import { sortBooks } from '@/lib/sort';

const LIBRARY_FILTERS: FilterPillOption<LibraryFilter>[] = [
	{ key: 'all', label: 'All' },
	{ key: 'favorites', label: 'Favorites' },
	{ key: 'want_to_read', label: 'Wishlist' },
	{ key: 'read', label: 'Read' },
	{ key: 'not_read', label: 'Not read' },
];

export default function LibraryScreen() {
	const { books, error: catalogError, refetch: refetchCatalog } = useBooks();
	const { userBooks, loading, refetch } = useUserBooks();
	const insets = useSafeAreaInsets();
	const [filter, setFilter] = useState<LibraryFilter>('all');
	const { sort, openSortMenu } = useCatalogSort('@ossus/library_sort');
	const router = useRouter();

	const shelvedBooks = useMemo(
		() =>
			sortBooks(
				books.filter((book) => {
					const ub = userBooks.get(book.id);
					return ub ? deriveLibraryFilter(ub, filter) : false;
				}),
				sort,
			),
		[books, userBooks, filter, sort],
	);

	// "Collection awaits" shows only when nothing is on a library shelf at all. A
	// favorite-only row doesn't count as a library book (same rule as the "All" pill).
	const hasLibraryBooks = useMemo(
		() => Array.from(userBooks.values()).some((ub) => ub.owned || ub.read || ub.want_to_read),
		[userBooks],
	);

	const renderItem = useCallback(({ item }: { item: Book }) => <BookCard book={item} />, []);
	const keyExtractor = useCallback((item: Book) => item.id, []);

	if (catalogError) {
		return (
			<ErrorState
				title="Couldn't load the archive"
				message={catalogError}
				onRetry={refetchCatalog}
			/>
		);
	}

	if (!hasLibraryBooks && !loading) {
		return (
			<View style={styles.emptyContainer}>
				<Text style={styles.emptyTitle}>Your collection awaits</Text>
				<Text style={styles.emptySubtitle}>
					Browse the catalog or scan a barcode to start building your Star Wars library.
				</Text>
				<View style={styles.emptyActions}>
					<Pressable style={styles.ctaButton} onPress={() => router.push('/archives')}>
						<Text style={styles.ctaText}>Browse Catalog</Text>
					</Pressable>
					<Pressable style={styles.ctaSecondary} onPress={() => router.push('/scan')}>
						<Text style={styles.ctaSecondaryText}>Scan a Barcode</Text>
					</Pressable>
				</View>
			</View>
		);
	}

	return (
		<View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
			<Stack.Screen
				options={{ headerRight: () => <TabHeaderActions showFilter onFilter={openSortMenu} /> }}
			/>
			<FlashList
				data={shelvedBooks}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				extraData={filter}
				refreshing={loading}
				onRefresh={refetch}
				ListHeaderComponent={
					<View style={styles.filterRow}>
						<FilterPills options={LIBRARY_FILTERS} value={filter} onChange={setFilter} />
					</View>
				}
				ListEmptyComponent={
					<View style={styles.emptyList}>
						<Text style={styles.emptyFilterText}>No books in this category</Text>
					</View>
				}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.surface.background,
	},
	filterRow: {
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
		backgroundColor: tokens.surface.background,
	},
	emptyTitle: {
		fontSize: 22,
		fontWeight: '700',
		letterSpacing: 1,
		marginBottom: 10,
		color: tokens.text.primary,
	},
	emptySubtitle: {
		fontSize: 15,
		color: tokens.text.secondary,
		textAlign: 'center',
		marginBottom: 28,
		lineHeight: 22,
	},
	emptyActions: {
		gap: 12,
		width: '100%',
	},
	ctaButton: {
		paddingVertical: 14,
		borderRadius: 8,
		backgroundColor: tokens.accent.primary,
		alignItems: 'center',
	},
	ctaText: {
		color: tokens.text.inverse,
		fontSize: 15,
		fontWeight: '600',
	},
	ctaSecondary: {
		paddingVertical: 14,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
		alignItems: 'center',
	},
	ctaSecondaryText: {
		color: tokens.text.secondary,
		fontSize: 15,
		fontWeight: '600',
	},
	emptyList: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
	},
	emptyFilterText: {
		fontSize: 15,
		color: tokens.text.hint,
	},
});
