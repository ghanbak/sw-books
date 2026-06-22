import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { tokens } from '@/constants/tokens';
import { GlassView, liquidGlassAvailable } from '@/lib/glass';

const SIZE = 36;

type Props = {
	icon: LucideIcon;
	onPress: () => void;
	accessibilityLabel: string;
	/** Tints the icon with the primary accent (e.g. an active favorite). */
	active?: boolean;
};

/**
 * Circular Liquid-Glass header/action button. Falls back to a flat translucent
 * circle when glass isn't available (iOS < 26, Android, Expo Go). Step 1 baseline;
 * enriched in the design-primitives step (reduce-transparency, container merging).
 */
export function GlassIconButton({ icon: Icon, onPress, accessibilityLabel, active }: Props) {
	const iconColor = active ? tokens.accent.primary : tokens.text.primary;
	return (
		<Pressable
			onPress={onPress}
			hitSlop={8}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ selected: active }}
			style={({ pressed }) => [styles.circle, pressed && styles.pressed]}
		>
			{liquidGlassAvailable ? (
				<GlassView style={StyleSheet.absoluteFill} />
			) : (
				<View style={[StyleSheet.absoluteFill, styles.fallback]} />
			)}
			<Icon size={18} color={iconColor} strokeWidth={2} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	circle: {
		width: SIZE,
		height: SIZE,
		borderRadius: SIZE / 2,
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
	pressed: {
		opacity: 0.6,
	},
	fallback: {
		backgroundColor: tokens.surface.card,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
	},
});
