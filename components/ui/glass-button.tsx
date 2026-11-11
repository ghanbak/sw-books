import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { GlassView, liquidGlassAvailable } from '@/lib/glass';

const HEIGHT = 56;

type Props = {
	label: string;
	onPress: () => void;
	accessibilityLabel?: string;
	accessibilityHint?: string;
	/** Swaps the press scale for an opacity dip (Reduce Motion). */
	reduceMotion?: boolean;
};

/**
 * Full-width capsule Liquid-Glass button tinted lightsaber blue (scan screen primary
 * action). Falls back to a solid accent capsule where glass isn't available (iOS < 26,
 * Android, Expo Go). Grows with Dynamic Type: min height 56, label wraps.
 */
export function GlassButton({
	label,
	onPress,
	accessibilityLabel,
	accessibilityHint,
	reduceMotion,
}: Props) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityHint={accessibilityHint}
			style={({ pressed }) => [
				styles.capsule,
				pressed && (reduceMotion ? styles.pressedStatic : styles.pressed),
			]}
		>
			{liquidGlassAvailable ? (
				<GlassView
					style={[StyleSheet.absoluteFill, styles.shape]}
					tintColor={tokens.accent.primary}
					isInteractive
				/>
			) : (
				<View style={[StyleSheet.absoluteFill, styles.shape, styles.fallback]} />
			)}
			<Text style={styles.label}>{label}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	capsule: {
		alignSelf: 'stretch',
		minHeight: HEIGHT,
		borderRadius: HEIGHT / 2,
		paddingHorizontal: 24,
		paddingVertical: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
	pressed: {
		transform: [{ scale: 0.96 }],
	},
	pressedStatic: {
		opacity: 0.7,
	},
	// Liquid Glass shapes its rim from the view's own corner radius (see GlassIconButton).
	shape: {
		borderRadius: HEIGHT / 2,
	},
	fallback: {
		backgroundColor: tokens.accent.primary,
	},
	// Dark label on both paths: text.inverse measures ~5.8:1 on the rendered blue glass
	// (sampled 71/142/217 on the iPhone 17 Pro sim) and ~5.9:1 on the solid fallback; text.primary is only ~2.9:1.
	label: {
		color: tokens.text.inverse,
		fontSize: 20,
		lineHeight: 24,
		fontWeight: '700',
		textAlign: 'center',
	},
});
