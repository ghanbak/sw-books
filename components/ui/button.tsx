import { Pressable, type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { useReduceMotion } from '@/hooks/useAccessibility';

export type ButtonVariant = 'primary' | 'secondary';

type Props = {
	label: string;
	onPress: () => void;
	/** `primary`: solid accent fill, dark label. `secondary`: card fill + hairline border. */
	variant?: ButtonVariant;
	disabled?: boolean;
	/** Outer layout only (margins, alignSelf). Fill, padding and states belong to the variant. */
	style?: StyleProp<ViewStyle>;
	accessibilityLabel?: string;
	accessibilityHint?: string;
};

/**
 * Solid action button for overlay states (scan capture, review, queued). Grows with
 * Dynamic Type: min height 48 (12 + 24 line + 12), label wraps. Press scales to 0.96,
 * or dips opacity under Reduce Motion, matching `GlassButton`.
 */
export function Button({
	label,
	onPress,
	variant = 'primary',
	disabled = false,
	style,
	accessibilityLabel,
	accessibilityHint,
}: Props) {
	const reduceMotion = useReduceMotion();
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityHint={accessibilityHint}
			accessibilityState={{ disabled }}
			style={({ pressed }) => [
				resolveButtonStyle({ variant, pressed, disabled, reduceMotion }),
				style,
			]}
		>
			<Text style={resolveButtonLabelStyle(variant)}>{label}</Text>
		</Pressable>
	);
}

type StyleState = {
	variant: ButtonVariant;
	pressed: boolean;
	disabled: boolean;
	reduceMotion: boolean;
};

/** Container style for a state. Pure so it tests in node: disabled wins over pressed. */
export function resolveButtonStyle({ variant, pressed, disabled, reduceMotion }: StyleState) {
	return [
		styles.base,
		variant === 'primary' ? styles.primary : styles.secondary,
		pressed && !disabled && (reduceMotion ? styles.pressedStatic : styles.pressed),
		disabled && styles.disabled,
	];
}

export function resolveButtonLabelStyle(variant: ButtonVariant) {
	return [styles.label, variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel];
}

const styles = StyleSheet.create({
	base: {
		minHeight: 48,
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	primary: {
		backgroundColor: tokens.accent.primary,
	},
	secondary: {
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	pressed: {
		transform: [{ scale: 0.96 }],
	},
	pressedStatic: {
		opacity: 0.7,
	},
	disabled: {
		opacity: 0.38,
	},
	label: {
		fontSize: 16,
		lineHeight: 24,
		textAlign: 'center',
		flexShrink: 1,
	},
	primaryLabel: {
		color: tokens.text.inverse,
		fontWeight: '600',
	},
	secondaryLabel: {
		color: tokens.text.primary,
		fontWeight: '500',
	},
});
