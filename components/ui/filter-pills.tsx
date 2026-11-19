import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { GlassView, liquidGlassAvailable } from '@/lib/glass';
import { FILTER_PILL_HIT_SLOP, FILTER_PILL_PADDING_V, slopBoundsStyle } from '@/lib/tap-target';

export type FilterPillOption<K extends string> = {
	key: K;
	label: string;
	accessibilityLabel?: string;
};

/**
 * Horizontal segmented filter pills (Figma 130:642 / 134:1450). Active pill is
 * solid blue; inactive pills use the glass surface when available, else a flat
 * bordered chip. Generic over the filter key so Archives (canon), Library (shelf),
 * and Timeline can all reuse it.
 */
export function FilterPills<K extends string>({
	options,
	value,
	onChange,
}: {
	options: FilterPillOption<K>[];
	value: K;
	onChange: (key: K) => void;
}) {
	return (
		<View style={styles.row}>
			{options.map(({ key, label, accessibilityLabel }) => {
				const active = key === value;
				return (
					<Pressable
						key={key}
						style={[styles.pill, active && styles.pillActive]}
						onPress={() => onChange(key)}
						// Vertical only (~30pt pill -> 44pt), so side-by-side pills don't overlap.
						hitSlop={FILTER_PILL_HIT_SLOP}
						accessibilityRole="button"
						accessibilityLabel={accessibilityLabel}
						accessibilityState={{ selected: active }}
					>
						{!active && liquidGlassAvailable && <GlassView style={StyleSheet.absoluteFill} />}
						<Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		// Native hit-testing drops touches outside the parent before child hitSlop applies,
		// so the row's bounds grow by the same slop (net zero layout).
		...slopBoundsStyle(FILTER_PILL_HIT_SLOP),
	},
	pill: {
		paddingHorizontal: 12,
		paddingVertical: FILTER_PILL_PADDING_V,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
		overflow: 'hidden',
	},
	pillActive: {
		backgroundColor: tokens.accent.primary,
		borderColor: tokens.accent.primary,
	},
	label: {
		fontSize: 13,
		fontWeight: '500',
		color: tokens.text.secondary,
	},
	labelActive: {
		color: tokens.text.inverse,
	},
});
