import { type SFSymbol, SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { tokens } from '@/constants/tokens';
import { GlassView, liquidGlassAvailable } from '@/lib/glass';

const SIZE = 36;

type Props = {
	/** SF Symbol name, e.g. `xmark`. */
	icon: SFSymbol;
	onPress: () => void;
	accessibilityLabel: string;
	/** Tints the icon with the primary accent (e.g. an active favorite). */
	active?: boolean;
	/** Circle diameter. Default 36; 44 for sheet toolbars (iOS 27 kit). */
	size?: number;
};

/**
 * Circular Liquid-Glass header/action button. Falls back to a flat translucent
 * circle when glass isn't available (iOS < 26, Android, Expo Go). Step 1 baseline;
 * enriched in the design-primitives step (reduce-transparency, container merging).
 */
export function GlassIconButton({ icon, onPress, accessibilityLabel, active, size = SIZE }: Props) {
	const iconColor = active ? tokens.accent.primary : tokens.text.primary;
	const shape = size === SIZE ? null : { width: size, height: size, borderRadius: size / 2 };
	return (
		<Pressable
			onPress={onPress}
			hitSlop={8}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ selected: active }}
			style={({ pressed }) => [styles.circle, shape, pressed && styles.pressed]}
		>
			{liquidGlassAvailable ? (
				<GlassView
					style={[StyleSheet.absoluteFill, styles.glass, shape && { borderRadius: size / 2 }]}
				/>
			) : (
				<View
					style={[StyleSheet.absoluteFill, styles.fallback, shape && { borderRadius: size / 2 }]}
				/>
			)}
			<SymbolView name={icon} size={Math.round(size / 2)} tintColor={iconColor} weight="medium" />
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
