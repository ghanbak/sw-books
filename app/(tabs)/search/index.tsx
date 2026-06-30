import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { BookCard } from '@/components/book-card';
import { TabHeaderActions } from '@/components/tab-header-actions';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import type { Book } from '@/lib/hooks';
import { useBooks } from '@/lib/hooks';
import { searchBooks } from '@/lib/search';

/**
 * Search tab — native iOS header search bar (under the large title) with live results.
 * Putting the field in the header lets the results FlatList be the screen's first child, so
 * the large title collapses on scroll (and there's no tab-bar clipping). Match logic is in
 * lib/search.ts.
 */
export default function SearchScreen() {
	const { books } = useBooks();
	const [query, setQuery] = useState('');
	const trimmed = query.trim();
	const results = useMemo(
		() => (trimmed.length === 0 ? [] : searchBooks(books, query)),
		[books, query, trimmed],
	);

	const renderItem = useCallback(({ item }: { item: Book }) => <BookCard book={item} />, []);
	const keyExtractor = useCallback((item: Book) => item.id, []);

	return (
		<>
			<TabHeaderActions />
			<Stack.Screen
				options={{
					headerSearchBarOptions: {
						placeholder: 'Search the archives…',
						autoCapitalize: 'none',
						// `onChangeText` gets a native event, not a string — read e.nativeEvent.text.
						onChangeText: (e) => setQuery(e.nativeEvent.text),
					},
				}}
			/>
			<FlatList
				style={styles.list}
				contentContainerStyle={results.length === 0 ? styles.emptyContent : undefined}
				data={results}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				contentInsetAdjustmentBehavior="automatic"
				keyboardDismissMode="on-drag"
				ListEmptyComponent={
					<View style={styles.center}>
						<Text style={styles.hint}>
							{trimmed.length === 0
								? 'Search the archives by title, author, or series.'
								: `No matches for “${trimmed}”.`}
						</Text>
					</View>
				}
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
		justifyContent: 'flex-start',
		alignItems: 'center',
		paddingHorizontal: 32,
		paddingTop: 24,
	},
	hint: {
		fontSize: 14,
		color: tokens.text.secondary,
		textAlign: 'center',
	},
});
