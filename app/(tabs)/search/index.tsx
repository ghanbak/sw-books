import { FlashList } from '@shopify/flash-list';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCard } from '@/components/book-card';
import { tokens } from '@/constants/tokens';
import type { Book } from '@/lib/hooks';
import { useBooks } from '@/lib/hooks';
import { searchBooks } from '@/lib/search';

/**
 * Search tab — large "Search" title (native header) with a bottom-anchored search
 * bar (thumb-reachable) and live results. The match logic lives in lib/search.ts.
 */
export default function SearchScreen() {
	const { books } = useBooks();
	const insets = useSafeAreaInsets();
	const [query, setQuery] = useState('');
	const trimmed = query.trim();
	const results = useMemo(() => searchBooks(books, query), [books, query]);

	const renderItem = useCallback(({ item }: { item: Book }) => <BookCard book={item} />, []);
	const keyExtractor = useCallback((item: Book) => item.id, []);

	return (
		<KeyboardAvoidingView
			style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
		>
			<View style={styles.results}>
				{trimmed.length === 0 ? (
					<View style={styles.center}>
						<Text style={styles.hint}>Search the archives by title, author, or series.</Text>
					</View>
				) : results.length === 0 ? (
					<View style={styles.center}>
						<Text style={styles.hint}>No matches for “{trimmed}”.</Text>
					</View>
				) : (
					<FlashList
						data={results}
						renderItem={renderItem}
						keyExtractor={keyExtractor}
						keyboardDismissMode="on-drag"
					/>
				)}
			</View>

			<View style={styles.searchBarRow}>
				<View style={styles.inputWrap}>
					<SearchIcon size={18} color={tokens.text.hint} strokeWidth={2} />
					<TextInput
						style={styles.input}
						placeholder="Search the archives…"
						placeholderTextColor={tokens.text.hint}
						value={query}
						onChangeText={setQuery}
						autoCapitalize="none"
						autoCorrect={false}
						returnKeyType="search"
					/>
				</View>
				{trimmed.length > 0 && (
					<Pressable
						style={styles.clearBtn}
						onPress={() => setQuery('')}
						accessibilityRole="button"
						accessibilityLabel="Clear search"
					>
						<X size={18} color={tokens.text.primary} strokeWidth={2} />
					</Pressable>
				)}
			</View>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.surface.background,
	},
	results: {
		flex: 1,
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
	},
	hint: {
		fontSize: 14,
		color: tokens.text.secondary,
		textAlign: 'center',
	},
	searchBarRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	inputWrap: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		height: 44,
		borderRadius: 12,
		paddingHorizontal: 12,
		backgroundColor: tokens.surface.card,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
	},
	input: {
		flex: 1,
		fontSize: 15,
		color: tokens.text.primary,
	},
	clearBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: tokens.surface.card,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
	},
});
