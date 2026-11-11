import { type AndroidSymbol, type SFSymbol, SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { tokens } from '@/constants/tokens';
import { SHELF_STATE_KEYS, type ShelfState } from '@/lib/shelf-state';

/** Same filled glyphs as the detail toggles (toolbar + favorite star), so the row reads at a glance. */
const SHELF_SYMBOLS: Record<keyof ShelfState, { ios: SFSymbol; android: AndroidSymbol }> = {
	owned: { ios: 'checkmark.circle.fill', android: 'check_circle' },
	read: { ios: 'book.fill', android: 'menu_book' },
	wishlist: { ios: 'bookmark.fill', android: 'bookmark' },
	favorite: { ios: 'star.fill', android: 'star' },
};

const SHELF_ICON_SIZE = 13;

/**
 * Small row of shelf-state glyphs for `BookCard`'s data column (#284). Decorative: the row's
 * accessible value speaks the state, so the glyphs are hidden from VoiceOver / TalkBack.
 * Tinted with the primary accent, the same blue the detail toggles use when active.
 */
export function ShelfBadges({ shelf }: { shelf: ShelfState }) {
	return (
		<View
			style={styles.row}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			{SHELF_STATE_KEYS.filter((key) => shelf[key]).map((key) => (
				<SymbolView
					key={key}
					name={SHELF_SYMBOLS[key]}
					size={SHELF_ICON_SIZE}
					tintColor={tokens.accent.primary}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		gap: 4,
	},
});
