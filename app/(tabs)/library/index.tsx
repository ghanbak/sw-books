import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { BookCard } from '@/components/book-card';
import { ErrorState } from '@/components/error-state';
import { TabHeaderActions } from '@/components/tab-header-actions';
import { type FilterPillOption, FilterPills } from '@/components/ui/filter-pills';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { useCatalogSort } from '@/hooks/useCatalogSort';
import type { Book } from '@/lib/hooks';
import { useBooks, useUserBooks } from '@/lib/hooks';
import { type LibraryFilter, deriveLibraryFilter, selectLibraryView } from '@/lib/library-filter';
import { sortBooks } from '@/lib/sort';

const LIBRARY_FILTERS: FilterPillOption<LibraryFilter>[] = [
	{ key: 'all', label: 'All' },
	{ key: 'favorites', label: 'Favorites' },
	{ key: 'want_to_read', label: 'Wishlist' },
	{ key: 'read', label: 'Read' },
	{ key: 'not_read', label: 'Not read' },
];

export default function LibraryScreen() {
	const {
		books,
		loading: catalogLoading,
		error: catalogError,
		refetch: refetchCatalog,
	} = useBooks();
	const { userBooks, loading, error: shelfError, refetch } = useUserBooks();
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

	const view = useMemo(
		() =>
			selectLibraryView({
				catalog: { loading: catalogLoading, error: catalogError, count: books.length },
				shelf: { loading, error: shelfError, rows: userBooks.values() },
				visibleCount: shelvedBooks.length,
				filter,
			}),
		[
			catalogLoading,
			catalogError,
			books.length,
			loading,
			shelfError,
			userBooks,
			shelvedBooks.length,
			filter,
		],
	);
	const pillOptions = useMemo(
		() => LIBRARY_FILTERS.filter((o) => view.pills.includes(o.key)),
		[view.pills],
	);

	const renderItem = useCallback(({ item }: { item: Book }) => <BookCard book={item} />, []);
	const keyExtractor = useCallback((item: Book) => item.id, []);

	// Every state renders inside the always-mounted FlatList (as ListEmptyComponent), so the
	// header actions stay and the large title still collapses — see Archives (rn-screens#2871).
	const listEmpty =
		view.kind === 'loading' ? (
			<View style={styles.emptyList}>
				<ActivityIndicator size="large" color={tokens.accent.primary} />
			</View>
		) : view.kind === 'error' ? (
			view.source === 'shelf' ? (
				<ErrorState title="Couldn't load your library" message={shelfError} onRetry={refetch} />
			) : (
				<ErrorState
					title="Couldn't load the archive"
					message={catalogError}
					onRetry={refetchCatalog}
				/>
			)
		) : view.kind === 'onboarding' ? (
			<View style={styles.emptyContainer}>
				<Text style={styles.emptyTitle}>Your collection awaits</Text>
				<Text style={styles.emptySubtitle}>
					Browse the catalog or scan a barcode to start building your Star Wars library.
				</Text>
				<View style={styles.emptyActions}>
					<Pressable
						style={styles.ctaButton}
						onPress={() => router.push('/archives')}
						accessibilityRole="button"
					>
						<Text style={styles.ctaText}>Browse Catalog</Text>
					</Pressable>
					<Pressable
						style={styles.ctaSecondary}
						onPress={() => router.push('/scan')}
						accessibilityRole="button"
					>
						<Text style={styles.ctaSecondaryText}>Scan a Barcode</Text>
					</Pressable>
				</View>
			</View>
		) : (
			<View style={styles.emptyList}>
				<Text style={styles.emptyFilterText}>{view.emptyCopy}</Text>
			</View>
		);

	return (
		<>
			<TabHeaderActions showFilter onFilter={openSortMenu} />
			<FlatList
				style={styles.list}
				contentContainerStyle={shelvedBooks.length === 0 ? styles.emptyContent : undefined}
				data={shelvedBooks}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				extraData={filter}
				contentInsetAdjustmentBehavior="automatic"
				// The loading state has its own spinner; don't stack the refresh control on it.
				refreshing={view.kind === 'list' && loading}
				onRefresh={refetch}
				ListHeaderComponent={
					pillOptions.length > 0 ? (
						<View style={styles.filterRow}>
							<FilterPills options={pillOptions} value={filter} onChange={setFilter} />
						</View>
					) : null
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
	filterRow: {
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
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
		color: tokens.text.tertiary,
		textAlign: 'center',
	},
});
