import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BookCard } from '@/components/book-card';
import { ErrorState } from '@/components/error-state';
import { TabHeaderActions } from '@/components/tab-header-actions';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { announce } from '@/hooks/useAccessibility';
import { useScrollResetOnChange } from '@/hooks/useScrollResetOnChange';
import type { Book } from '@/lib/hooks';
import { useBooks, useUserBooks } from '@/lib/hooks';
import { selectListState } from '@/lib/list-state';
import { searchBooks } from '@/lib/search';
import { searchAnnouncement } from '@/lib/search-a11y';
import { shelfStatesByBook } from '@/lib/shelf-state';

/** Wait for typing to settle before speaking the result count. */
const ANNOUNCE_DELAY_MS = 600;
const MVCP_DISABLED = { disabled: true };

/**
 * Search tab — native iOS header search bar (under the large title) with live results.
 * Putting the field in the header lets the results FlashList be the screen's first child, so
 * the large title collapses on scroll (and there's no tab-bar clipping). Match logic is in
 * lib/search.ts.
 */
export default function SearchScreen() {
	const { books, loading, error, refetch } = useBooks();
	const [query, setQuery] = useState('');
	const trimmed = query.trim();
	const results = useMemo(
		() => (trimmed.length === 0 ? [] : searchBooks(books, query)),
		[books, query, trimmed],
	);

	// Catalog state first: until it loads, an empty result is "not loaded yet", not "no match".
	const catalogState = selectListState({ loading, error, count: books.length });

	// Focus stays in the search field, so speak the outcome. `trimmed` is a dep so a new query
	// with the same count still announces.
	useEffect(() => {
		const message = searchAnnouncement({ query: trimmed, catalogState, count: results.length });
		if (message === null) return;
		const timer = setTimeout(() => announce(message), ANNOUNCE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [trimmed, catalogState, results.length]);

	// A new query replaces the results wholesale: back to the top so the new first match (or the
	// empty state) is in view under the header, not wherever the old results were scrolled to.
	const listRef = useRef<FlashListRef<Book>>(null);
	const scrollReset = useScrollResetOnChange(listRef, trimmed);

	// Shelf state once per list; equal states share one object, so a toggle re-renders only its row.
	const { userBooks } = useUserBooks();
	const shelfByBook = useMemo(() => shelfStatesByBook(userBooks), [userBooks]);

	const renderItem = useCallback(
		({ item }: { item: Book }) => <BookCard book={item} shelf={shelfByBook.get(item.id)} />,
		[shelfByBook],
	);
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
			<FlashList
				ref={listRef}
				style={styles.list}
				contentContainerStyle={results.length === 0 ? styles.emptyContent : undefined}
				data={results}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				contentInsetAdjustmentBehavior="automatic"
				keyboardDismissMode="on-drag"
				// Results aren't a feed: anchoring the old first item would fight the reset.
				maintainVisibleContentPosition={MVCP_DISABLED}
				{...scrollReset}
				ListEmptyComponent={
					catalogState === 'loading' ? (
						<View style={styles.center}>
							<ActivityIndicator size="large" color={tokens.accent.primary} />
						</View>
					) : catalogState === 'error' ? (
						<ErrorState title="Couldn't load the archive" message={error} onRetry={refetch} />
					) : (
						<View style={styles.center}>
							<Text style={styles.hint}>
								{trimmed.length === 0
									? 'Search the archives by title, author, or series.'
									: `No matches for “${trimmed}”.`}
							</Text>
						</View>
					)
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
