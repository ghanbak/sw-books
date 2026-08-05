import { Stack } from 'expo-router';

import { tokens } from '@/constants/tokens';
import { useUserBooks } from '@/lib/hooks';

/**
 * Book-detail bottom toolbar as a native `Stack.Toolbar` (iOS bottom bar): a prominent
 * "Add to library / In library" (owned) on the left, plus Wishlist (want_to_read) and Read
 * (read) toggles on the right. Active toggles tint blue and swap to their filled SF Symbol.
 *
 * `Stack.Toolbar` with bottom placement must be rendered from the page component (book/[id]),
 * not a layout — this component is mounted inside that page.
 */
export function BookDetailToolbar({ bookId }: { bookId: string }) {
	const { userBooks, toggleShelf } = useUserBooks();
	const entry = userBooks.get(bookId);
	const owned = entry?.owned ?? false;
	const wishlist = entry?.want_to_read ?? false;
	const read = entry?.read ?? false;

	return (
		<Stack.Toolbar placement="bottom">
			<Stack.Toolbar.Button
				icon={owned ? 'checkmark.circle.fill' : 'plus.circle'}
				variant="prominent"
				tintColor={owned ? tokens.accent.primary : undefined}
				onPress={() => toggleShelf(bookId, 'owned')}
			>
				{owned ? 'In library' : 'Add to library'}
			</Stack.Toolbar.Button>
			<Stack.Toolbar.Spacer />
			<Stack.Toolbar.Button
				icon={wishlist ? 'bookmark.fill' : 'bookmark'}
				tintColor={wishlist ? tokens.accent.primary : undefined}
				accessibilityLabel={wishlist ? 'Remove from wishlist' : 'Add to wishlist'}
				onPress={() => toggleShelf(bookId, 'want_to_read')}
			/>
			<Stack.Toolbar.Button
				icon={read ? 'book.fill' : 'book'}
				tintColor={read ? tokens.accent.primary : undefined}
				accessibilityLabel={read ? 'Mark as unread' : 'Mark as read'}
				onPress={() => toggleShelf(bookId, 'read')}
			/>
		</Stack.Toolbar>
	);
}
