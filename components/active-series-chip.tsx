import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { FILTER_PILL_HIT_SLOP, FILTER_PILL_PADDING_V, slopBoundsStyle } from '@/lib/tap-target';

/**
 * The active-series pill above the Archives list (#286): names the series being shown (in
 * reading order) and clears it on tap. Same size and solid-blue fill as an active filter pill,
 * so it reads as part of the filter rows; the header Series menu is the other way to clear.
 */
export function ActiveSeriesChip({ series, onClear }: { series: string; onClear: () => void }) {
	return (
		<View style={styles.row}>
			<Pressable
				style={styles.pill}
				onPress={onClear}
				hitSlop={FILTER_PILL_HIT_SLOP}
				accessibilityRole="button"
				accessibilityLabel={`Series: ${series}`}
				accessibilityHint="Clears the series and shows all books"
			>
				<SymbolView
					name={{ ios: 'books.vertical.fill', android: 'collections_bookmark' }}
					size={13}
					tintColor={tokens.text.inverse}
				/>
				<Text style={styles.label} numberOfLines={1}>
					{series}
				</Text>
				<SymbolView
					name={{ ios: 'xmark', android: 'close' }}
					size={11}
					weight="bold"
					tintColor={tokens.text.inverse}
				/>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		...slopBoundsStyle(FILTER_PILL_HIT_SLOP),
	},
	pill: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		maxWidth: '100%',
		paddingHorizontal: 12,
		paddingVertical: FILTER_PILL_PADDING_V,
		borderRadius: 16,
		borderCurve: 'continuous',
		borderWidth: 1,
		borderColor: tokens.accent.primary,
		backgroundColor: tokens.accent.primary,
	},
	label: {
		flexShrink: 1,
		fontSize: 13,
		fontWeight: '500',
		color: tokens.text.inverse,
	},
});
