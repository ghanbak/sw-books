import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { BookCard } from '@/components/book-card';
import type { Book } from '@/lib/hooks';
import { useBooks, useUserBooks } from '@/lib/hooks';

type ShelfFilter = 'all' | 'owned' | 'read' | 'want_to_read';

const FILTERS: { key: ShelfFilter; label: string }[] = [
	{ key: 'all', label: 'All' },
	{ key: 'owned', label: 'Owned' },
	{ key: 'read', label: 'Read' },
	{ key: 'want_to_read', label: 'Want to Read' },
];

export default function ShelfScreen() {
	const { books } = useBooks();
	const { userBooks, loading, refetch } = useUserBooks();
	const [filter, setFilter] = useState<ShelfFilter>('all');
	const router = useRouter();

	const shelvedBooks = useMemo(() => {
		const result: Book[] = [];
		for (const book of books) {
			const ub = userBooks.get(book.id);
			if (!ub) continue;

			if (filter === 'all') {
				if (ub.owned || ub.read || ub.want_to_read) result.push(book);
			} else if (ub[filter]) {
				result.push(book);
			}
		}
		return result;
	}, [books, userBooks, filter]);

	const counts = useMemo(() => {
		let owned = 0;
		let read = 0;
		let wantToRead = 0;
		let all = 0;
		for (const ub of userBooks.values()) {
			if (ub.owned || ub.read || ub.want_to_read) all++;
			if (ub.owned) owned++;
			if (ub.read) read++;
			if (ub.want_to_read) wantToRead++;
		}
		return { all, owned, read, want_to_read: wantToRead };
	}, [userBooks]);

	const renderItem = useCallback(({ item }: { item: Book }) => <BookCard book={item} />, []);
	const keyExtractor = useCallback((item: Book) => item.id, []);

	if (counts.all === 0 && !loading) {
		return (
			<View style={styles.emptyContainer}>
				<Text style={styles.emptyEmoji}>📚</Text>
				<Text style={styles.emptyTitle}>Your bookshelf is empty</Text>
				<Text style={styles.emptySubtitle}>
					Browse the catalog or scan a barcode to add books.
				</Text>
				<View style={styles.emptyActions}>
					<Pressable style={styles.ctaButton} onPress={() => router.push('/(tabs)')}>
						<Text style={styles.ctaText}>Browse catalog</Text>
					</Pressable>
					<Pressable
						style={[styles.ctaButton, styles.ctaSecondary]}
						onPress={() => router.push('/(tabs)/scan')}
					>
						<Text style={[styles.ctaText, styles.ctaSecondaryText]}>Scan a barcode</Text>
					</Pressable>
				</View>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<View style={styles.filterRow}>
				{FILTERS.map(({ key, label }) => (
					<Pressable
						key={key}
						style={[styles.filterChip, filter === key && styles.filterChipActive]}
						onPress={() => setFilter(key)}
					>
						<Text
							style={[
								styles.filterChipText,
								filter === key && styles.filterChipTextActive,
							]}
						>
							{label} ({counts[key]})
						</Text>
					</Pressable>
				))}
			</View>

			<FlatList
				data={shelvedBooks}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				refreshing={loading}
				onRefresh={refetch}
				contentContainerStyle={shelvedBooks.length === 0 ? styles.emptyList : undefined}
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
	},
	filterRow: {
		flexDirection: 'row',
		paddingHorizontal: 12,
		paddingVertical: 10,
		gap: 8,
		flexWrap: 'wrap',
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
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
	},
	emptyEmoji: {
		fontSize: 48,
		marginBottom: 16,
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: '600',
		marginBottom: 8,
	},
	emptySubtitle: {
		fontSize: 14,
		opacity: 0.5,
		textAlign: 'center',
		marginBottom: 24,
	},
	emptyActions: {
		gap: 12,
		width: '100%',
	},
	ctaButton: {
		paddingVertical: 14,
		borderRadius: 8,
		backgroundColor: '#1a3a5c',
		alignItems: 'center',
	},
	ctaSecondary: {
		backgroundColor: '#f0f0f0',
	},
	ctaText: {
		color: '#fff',
		fontSize: 15,
		fontWeight: '600',
	},
	ctaSecondaryText: {
		color: '#333',
	},
	emptyList: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
	},
	emptyFilterText: {
		fontSize: 15,
		opacity: 0.5,
	},
});
