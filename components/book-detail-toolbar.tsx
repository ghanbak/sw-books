import { Stack } from 'expo-router';

import { tokens } from '@/constants/tokens';
import { useToolbarIcon } from '@/hooks/useToolbarIcon';
import { useUserBooks } from '@/lib/hooks';

/**
 * Book-detail bottom toolbar as a native `Stack.Toolbar` (iOS bottom bar): a prominent
 * "Add to library / In library" (owned) on the left, plus Wishlist (want_to_read) and Read
 * (read) toggles on the right. Active toggles tint blue and swap to their filled SF Symbol.
 * Android: icons come from `useToolbarIcon` (Material Symbols); the toolbar there is icon-only,
 * so the prominent button's text becomes its TalkBack label.
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
	const ownedIcon = useToolbarIcon(owned ? 'checkmark.circle.fill' : 'plus.circle');
	const wishlistIcon = useToolbarIcon(wishlist ? 'bookmark.fill' : 'bookmark');
	const readIcon = useToolbarIcon(read ? 'book.fill' : 'book');
	const ownedLabel = owned ? 'In library' : 'Add to library';

	return (
		<Stack.Toolbar placement="bottom">
			{ownedIcon && (
				<Stack.Toolbar.Button
					icon={ownedIcon}
					variant="prominent"
					tintColor={owned ? tokens.accent.primary : undefined}
					accessibilityLabel={process.env.EXPO_OS === 'android' ? ownedLabel : undefined}
					onPress={() => toggleShelf(bookId, 'owned')}
				>
					{ownedLabel}
				</Stack.Toolbar.Button>
			)}
			<Stack.Toolbar.Spacer />
			{wishlistIcon && (
				<Stack.Toolbar.Button
					icon={wishlistIcon}
					tintColor={wishlist ? tokens.accent.primary : undefined}
					accessibilityLabel={wishlist ? 'Remove from wishlist' : 'Add to wishlist'}
					onPress={() => toggleShelf(bookId, 'want_to_read')}
				/>
			)}
			{readIcon && (
				<Stack.Toolbar.Button
					icon={readIcon}
					tintColor={read ? tokens.accent.primary : undefined}
					accessibilityLabel={read ? 'Mark as unread' : 'Mark as read'}
					onPress={() => toggleShelf(bookId, 'read')}
				/>
			)}
		</Stack.Toolbar>
	);
}
