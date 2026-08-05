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
	/** Fills the icon (e.g. a filled star when favorited). */
	filled?: boolean;
};

/**
 * Circular Liquid-Glass header/action button. Falls back to a flat translucent
 * circle when glass isn't available (iOS < 26, Android, Expo Go). Step 1 baseline;
 * enriched in the design-primitives step (reduce-transparency, container merging).
 */
export function GlassIconButton({
	icon: Icon,
	onPress,
	accessibilityLabel,
	active,
	filled,
}: Props) {
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
				<GlassView style={[StyleSheet.absoluteFill, styles.glass]} />
			) : (
				<View style={[StyleSheet.absoluteFill, styles.fallback]} />
			)}
			<Icon size={18} color={iconColor} fill={filled ? iconColor : 'transparent'} strokeWidth={2} />
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
	// iOS Liquid Glass shapes its rim from the view's own corner radius — without this the
	// glass renders as a square inside the circular clip. Match the circle so it reads round.
	glass: {
		borderRadius: SIZE / 2,
	},
	fallback: {
		backgroundColor: tokens.surface.card,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
	},
});
