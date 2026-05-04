import { BookOpen, ScanBarcode } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { BookCard } from '@/components/book-card';
import { tokens } from '@/constants/tokens';
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
	const separator = useCallback(
		() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tokens.border.subtle, marginHorizontal: 12 }} />,
		[],
	);

	if (counts.all === 0 && !loading) {
		return (
			<View style={styles.emptyContainer}>
				<Text style={styles.emptyTitle}>Your collection awaits</Text>
				<Text style={styles.emptySubtitle}>
					Browse the catalog or scan a barcode to start building your Star Wars library.
				</Text>
				<View style={styles.emptyActions}>
					<Pressable style={styles.ctaButton} onPress={() => router.push('/(tabs)')}>
						<Text style={styles.ctaText}>Browse Catalog</Text>
					</Pressable>
					<Pressable
						style={styles.ctaSecondary}
						onPress={() => router.push('/(tabs)/scan')}
					>
						<Text style={styles.ctaSecondaryText}>Scan a Barcode</Text>
					</Pressable>
				</View>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<View style={styles.filterRow}>
				{FILTERS.map(({ key, label }) => {
					const active = filter === key;
					return (
						<Pressable
							key={key}
							style={[styles.filterChip, active && styles.filterChipActive]}
							onPress={() => setFilter(key)}
						>
							<Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
								{label} ({counts[key]})
							</Text>
						</Pressable>
					);
				})}
			</View>

			<FlatList
				data={shelvedBooks}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				ItemSeparatorComponent={separator}
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
		backgroundColor: tokens.surface.background,
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
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	filterChipActive: {
		backgroundColor: tokens.accent.primary,
		borderColor: tokens.accent.primary,
	},
	filterChipText: {
		fontSize: 13,
		fontWeight: '500',
		color: tokens.text.secondary,
	},
	filterChipTextActive: {
		color: tokens.text.inverse,
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
		fontFamily: 'SpaceGrotesk_500Medium',
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
