import { useCallback, useMemo, useState } from 'react';
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';

import { BookCard } from '@/components/book-card';
import type { Book } from '@/lib/hooks';
import { useBooks } from '@/lib/hooks';

type CanonFilter = 'all' | 'Canon' | 'Legends';

export default function CatalogScreen() {
	const { books, loading, error, refetch } = useBooks();
	const [search, setSearch] = useState('');
	const [canonFilter, setCanonFilter] = useState<CanonFilter>('all');

	const filteredBooks = useMemo(() => {
		let result = books;

		if (canonFilter !== 'all') {
			result = result.filter((b) => b.canon === canonFilter);
		}

		if (search.trim()) {
			const q = search.toLowerCase();
			result = result.filter(
				(b) =>
					b.title.toLowerCase().includes(q) ||
					b.author.some((a) => a.toLowerCase().includes(q)) ||
					b.series_name?.toLowerCase().includes(q),
			);
		}

		return result;
	}, [books, search, canonFilter]);

	const renderItem = useCallback(({ item }: { item: Book }) => <BookCard book={item} />, []);
	const keyExtractor = useCallback((item: Book) => item.id, []);

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	if (error) {
		return (
			<View style={styles.center}>
				<Text style={styles.errorText}>Failed to load books</Text>
				<Text style={styles.errorDetail}>{error}</Text>
				<Pressable style={styles.retryButton} onPress={refetch}>
					<Text style={styles.retryText}>Retry</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<View style={styles.searchBar}>
				<TextInput
					style={styles.searchInput}
					placeholder="Search by title, author, or series..."
					value={search}
					onChangeText={setSearch}
					clearButtonMode="while-editing"
					autoCapitalize="none"
					autoCorrect={false}
				/>
			</View>

			<View style={styles.filterRow}>
				{(['all', 'Canon', 'Legends'] as const).map((filter) => (
					<Pressable
						key={filter}
						style={[styles.filterChip, canonFilter === filter && styles.filterChipActive]}
						onPress={() => setCanonFilter(filter)}
					>
						<Text
							style={[
								styles.filterChipText,
								canonFilter === filter && styles.filterChipTextActive,
							]}
						>
							{filter === 'all' ? 'All' : filter}
						</Text>
					</Pressable>
				))}
				<Text style={styles.count}>{filteredBooks.length} books</Text>
			</View>

			<FlatList
				data={filteredBooks}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				refreshing={loading}
				onRefresh={refetch}
				contentContainerStyle={filteredBooks.length === 0 ? styles.emptyContainer : undefined}
				ListEmptyComponent={
					<View style={styles.center}>
						<Text style={styles.emptyText}>No books match your search</Text>
					</View>
				}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	searchBar: {
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	searchInput: {
		height: 40,
		borderRadius: 8,
		backgroundColor: '#f0f0f0',
		paddingHorizontal: 12,
		fontSize: 15,
	},
	filterRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingBottom: 8,
		gap: 8,
	},
	filterChip: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
		backgroundColor: '#f0f0f0',
	},
	filterChipActive: {
		backgroundColor: '#1a3a5c',
	},
	filterChipText: {
		fontSize: 13,
		fontWeight: '500',
	},
	filterChipTextActive: {
		color: '#fff',
	},
	count: {
		marginLeft: 'auto',
		fontSize: 12,
		opacity: 0.5,
	},
	emptyContainer: {
		flex: 1,
	},
	emptyText: {
		fontSize: 15,
		opacity: 0.5,
	},
	errorText: {
		fontSize: 17,
		fontWeight: '600',
		marginBottom: 8,
	},
	errorDetail: {
		fontSize: 13,
		opacity: 0.5,
		marginBottom: 16,
	},
	retryButton: {
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: '#1a3a5c',
	},
	retryText: {
		color: '#fff',
		fontWeight: '600',
	},
});
