import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCard } from '@/components/book-card';
import { ErrorState } from '@/components/error-state';
import { type FilterPillOption, FilterPills } from '@/components/ui/filter-pills';
import { tokens } from '@/constants/tokens';
import type { Book } from '@/lib/hooks';
import { useBooks } from '@/lib/hooks';
import { DEFAULT_SORT, sortBooks } from '@/lib/sort';

type CanonFilter = 'all' | 'Canon' | 'Legends';

const CANON_OPTIONS: FilterPillOption<CanonFilter>[] = [
	{ key: 'all', label: 'All' },
	{ key: 'Canon', label: 'Canon' },
	{ key: 'Legends', label: 'Legends' },
];

export default function CatalogScreen() {
	const { books, loading, error, refetch } = useBooks();
	const insets = useSafeAreaInsets();
	const [canonFilter, setCanonFilter] = useState<CanonFilter>('all');

	const filteredBooks = useMemo(() => {
		const result = canonFilter === 'all' ? books : books.filter((b) => b.canon === canonFilter);
		return sortBooks(result, DEFAULT_SORT);
	}, [books, canonFilter]);

	const renderItem = useCallback(({ item }: { item: Book }) => <BookCard book={item} />, []);
	const keyExtractor = useCallback((item: Book) => item.id, []);

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size="large" color={tokens.accent.primary} />
			</View>
		);
	}

	if (error) {
		return <ErrorState title="Couldn't load the archive" message={error} onRetry={refetch} />;
	}

	return (
		<View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
			<FlashList
				data={filteredBooks}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				refreshing={loading}
				onRefresh={refetch}
				ListHeaderComponent={
					<View style={styles.controls}>
						<FilterPills options={CANON_OPTIONS} value={canonFilter} onChange={setCanonFilter} />
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
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
		backgroundColor: tokens.surface.background,
	},
	controls: {
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
});
