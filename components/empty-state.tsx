import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';

type EmptyStateProps = {
	message: string;
	/**
	 * `screen` (default) fills the available area and centers the message both ways — for a
	 * list or screen with nothing to show. `inline` sits in the flow (e.g. inside a sheet).
	 */
	variant?: 'screen' | 'inline';
	style?: StyleProp<ViewStyle>;
};

/**
 * Standard empty / not-found message. One quiet, centered line of supporting text so the
 * covers stay the hero when they're back. Pair with ErrorState for failed fetches.
 */
export function EmptyState({ message, variant = 'screen', style }: EmptyStateProps) {
	const inline = variant === 'inline';
	return (
		<View style={[inline ? styles.inline : styles.screen, style]}>
			<Text style={[styles.message, inline && styles.messageInline]}>{message}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingHorizontal: 40,
		paddingVertical: 48,
	},
	inline: {
		alignItems: 'center',
		paddingHorizontal: 24,
		paddingVertical: 16,
	},
	message: {
		maxWidth: 320,
		fontSize: 18,
		lineHeight: 24,
		color: tokens.text.secondary,
		textAlign: 'center',
	},
	messageInline: {
		fontSize: 16,
		lineHeight: 24,
	},
});
