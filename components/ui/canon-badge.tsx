import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';

/**
 * The Canon/Legends status pill (extracted from BookCard so the Archives list and the
 * Timeline hero share one look). Solid canon/legends fill with an uppercase label. Pass
 * `style` to position it — e.g. inline in a list row, or as an absolute corner overlay on
 * a cover.
 */
export function CanonBadge({ canon, style }: { canon: string; style?: StyleProp<ViewStyle> }) {
	const isCanon = canon === 'Canon';
	return (
		<View style={[styles.badge, isCanon ? styles.canonBadge : styles.legendsBadge, style]}>
			<Text style={styles.badgeText}>{canon.toUpperCase()}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	badge: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	canonBadge: {
		backgroundColor: tokens.badge.canon,
	},
	legendsBadge: {
		backgroundColor: tokens.badge.legends,
	},
	badgeText: {
		color: tokens.text.primary,
		fontSize: 10,
		fontWeight: '700',
		letterSpacing: 0.5,
	},
});
