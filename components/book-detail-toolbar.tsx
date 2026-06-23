import { BookOpen, Bookmark, Check, Library, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '@/constants/tokens';
import { useUserBooks } from '@/lib/hooks';

/**
 * Pinned bottom toolbar on book detail (Figma 134:2853 / states 153:2511): a wide
 * "Add to library / In library" (owned) on the left, and Wishlist (want_to_read) +
 * Read (read) icon toggles on the right. Active toggles tint blue.
 */
export function BookDetailToolbar({ bookId }: { bookId: string }) {
	const insets = useSafeAreaInsets();
	const { userBooks, toggleShelf } = useUserBooks();
	const entry = userBooks.get(bookId);
	const owned = entry?.owned ?? false;
	const wishlist = entry?.want_to_read ?? false;
	const read = entry?.read ?? false;

	return (
		<View style={[styles.bar, { paddingBottom: 10 + insets.bottom }]}>
			<Pressable
				style={[styles.library, owned && styles.libraryActive]}
				onPress={() => toggleShelf(bookId, 'owned')}
				accessibilityRole="button"
				accessibilityState={{ selected: owned }}
				accessibilityLabel={owned ? 'In your library' : 'Add to library'}
			>
				{owned ? (
					<Check size={18} color={tokens.accent.primary} strokeWidth={2.5} />
				) : (
					<Library size={18} color={tokens.text.primary} strokeWidth={2} />
				)}
				<Text style={[styles.libraryLabel, owned && styles.libraryLabelActive]}>
					{owned ? 'In library' : 'Add to library'}
				</Text>
			</Pressable>

			<IconToggle
				icon={Bookmark}
				active={wishlist}
				label={wishlist ? 'Remove from wishlist' : 'Add to wishlist'}
				onPress={() => toggleShelf(bookId, 'want_to_read')}
			/>
			<IconToggle
				icon={BookOpen}
				active={read}
				label={read ? 'Mark as unread' : 'Mark as read'}
				onPress={() => toggleShelf(bookId, 'read')}
			/>
		</View>
	);
}

function IconToggle({
	icon: Icon,
	active,
	label,
	onPress,
}: {
	icon: LucideIcon;
	active: boolean;
	label: string;
	onPress: () => void;
}) {
	const color = active ? tokens.accent.primary : tokens.text.primary;
	return (
		<Pressable
			style={[styles.iconBtn, active && styles.iconBtnActive]}
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ selected: active }}
		>
			<Icon size={20} color={color} fill={active ? color : 'transparent'} strokeWidth={2} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	bar: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 10,
		backgroundColor: tokens.surface.background,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: tokens.border.subtle,
	},
	library: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		height: 48,
		borderRadius: 24,
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	libraryActive: {
		borderColor: tokens.accent.primary,
		backgroundColor: tokens.border.accent,
	},
	libraryLabel: {
		fontSize: 15,
		fontWeight: '600',
		color: tokens.text.primary,
	},
	libraryLabelActive: {
		color: tokens.accent.primary,
	},
	iconBtn: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	iconBtnActive: {
		borderColor: tokens.accent.primary,
		backgroundColor: tokens.border.accent,
	},
});
