import { type SFSymbol, SymbolView } from 'expo-symbols';
import { type AccessibilityRole, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';

type Props = {
	label: string;
	onPress: () => void;
	/** Leading SF Symbol, tinted with the primary accent. */
	icon?: SFSymbol;
	/** On a `Card`: background fill (+ hairline border unless `fullWidth`). Default: card fill on the page. */
	onCard?: boolean;
	/** Stretch to the container width with centered content (the Wookieepedia card button). */
	fullWidth?: boolean;
	disabled?: boolean;
	accessibilityRole?: AccessibilityRole;
	accessibilityLabel?: string;
	accessibilityHint?: string;
};

/**
 * Tertiary button (Figma `SubtleButton` 234:25): 36 tall capsule, accent icon + primary
 * label. `hitSlop` 4 brings the target to 44pt. Hugs its content unless `fullWidth`.
 */
export function SubtleButton({
	label,
	onPress,
	icon,
	onCard = false,
	fullWidth = false,
	disabled = false,
	accessibilityRole = 'button',
	accessibilityLabel,
	accessibilityHint,
}: Props) {
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			hitSlop={HIT_SLOP}
			accessibilityRole={accessibilityRole}
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityHint={accessibilityHint}
			accessibilityState={{ disabled }}
			style={({ pressed }) => [
				styles.button,
				icon ? styles.withIcon : styles.noIcon,
				onCard ? styles.onCard : styles.onPage,
				onCard && !fullWidth && styles.bordered,
				fullWidth ? styles.fullWidth : styles.hug,
				pressed && styles.pressed,
				disabled && styles.disabled,
			]}
		>
			{icon && (
				<SymbolView name={icon} size={15} weight="medium" tintColor={tokens.accent.primary} />
			)}
			<Text style={styles.label}>{label}</Text>
		</Pressable>
	);
}

const HIT_SLOP = { top: 4, bottom: 4 } as const;

const styles = StyleSheet.create({
	button: {
		minHeight: 36,
		borderRadius: 18,
		paddingVertical: 9,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
	},
	withIcon: {
		paddingLeft: 12,
		paddingRight: 14,
	},
	noIcon: {
		paddingHorizontal: 14,
	},
	onPage: {
		backgroundColor: tokens.surface.card,
	},
	onCard: {
		backgroundColor: tokens.surface.background,
	},
	bordered: {
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
	},
	hug: {
		alignSelf: 'center',
	},
	fullWidth: {
		alignSelf: 'stretch',
	},
	pressed: {
		opacity: 0.6,
	},
	disabled: {
		opacity: 0.38,
	},
	label: {
		fontSize: 14,
		lineHeight: 18,
		fontWeight: '500',
		letterSpacing: -0.15,
		color: tokens.text.primary,
		flexShrink: 1,
		textAlign: 'center',
	},
});
