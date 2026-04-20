import { Search } from 'lucide-react-native';
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
import { tokens } from '@/constants/tokens';
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
	const separator = useCallback(
		() => (
			<View
				style={{
					height: StyleSheet.hairlineWidth,
					backgroundColor: tokens.border.subtle,
					marginLeft: 108,
					marginRight: 12,
				}}
			/>
		),
		[],
	);

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size="large" color={tokens.accent.primary} />
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
				<View style={styles.searchInputWrapper}>
					<Search size={16} color={tokens.text.hint} strokeWidth={2} />
					<TextInput
						style={styles.searchInput}
						placeholder="Search title, author, or series..."
						placeholderTextColor={tokens.text.hint}
						value={search}
						onChangeText={setSearch}
						clearButtonMode="while-editing"
						autoCapitalize="none"
						autoCorrect={false}
					/>
				</View>
			</View>

			<View style={styles.filterRow}>
				{(['all', 'Canon', 'Legends'] as const).map((filter) => {
					const active = canonFilter === filter;
					return (
						<Pressable
							key={filter}
							style={[styles.filterChip, active && styles.filterChipActive]}
							onPress={() => setCanonFilter(filter)}
						>
							<Text
								style={[styles.filterChipText, active && styles.filterChipTextActive]}
							>
								{filter === 'all' ? 'All' : filter}
							</Text>
						</Pressable>
					);
				})}
				<Text style={styles.count}>{filteredBooks.length} books</Text>
			</View>

			<FlatList
				data={filteredBooks}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				ItemSeparatorComponent={separator}
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
		backgroundColor: tokens.surface.background,
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
		backgroundColor: tokens.surface.background,
	},
	searchBar: {
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	searchInputWrapper: {
		flexDirection: 'row',
		alignItems: 'center',
		height: 40,
		borderRadius: 10,
		backgroundColor: tokens.surface.card,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
		paddingHorizontal: 12,
		gap: 8,
	},
	searchInput: {
		flex: 1,
		fontSize: 15,
		color: tokens.text.primary,
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
	count: {
		marginLeft: 'auto',
		fontSize: 12,
		color: tokens.text.hint,
		fontFamily: 'monospace',
	},
	emptyContainer: {
		flex: 1,
	},
	emptyText: {
		fontSize: 15,
		color: tokens.text.hint,
	},
	errorText: {
		fontSize: 17,
		fontWeight: '600',
		color: tokens.text.primary,
		marginBottom: 8,
	},
	errorDetail: {
		fontSize: 13,
		color: tokens.text.hint,
		marginBottom: 16,
	},
	retryButton: {
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: tokens.accent.primary,
	},
	retryText: {
		color: tokens.text.inverse,
		fontWeight: '600',
	},
});
