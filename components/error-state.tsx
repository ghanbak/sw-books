import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';

type ErrorStateProps = {
	title?: string;
	message?: string | null;
	retryLabel?: string;
	onRetry?: () => void | Promise<void>;
	/**
	 * `screen` (default) fills the area and centers the card. `inline` sits in a scroll
	 * flow (e.g. one failed section of a detail screen): no fill, no background, smaller title.
	 */
	variant?: 'screen' | 'inline';
	style?: StyleProp<ViewStyle>;
};

/**
 * Standard error surface for failed data fetches. Renders a centered card
 * with a title, optional detail message, and an optional retry button.
 *
 * Title defaults are screen-agnostic; pass a more specific title where it helps
 * (e.g., "Couldn't load catalog", "Book unavailable").
 */
export function ErrorState({
	title = 'Something went wrong',
	message,
	retryLabel = 'Retry',
	onRetry,
	variant = 'screen',
	style,
}: ErrorStateProps) {
	const inline = variant === 'inline';
	return (
		<View style={[inline ? styles.inline : styles.container, style]}>
			<Text style={[styles.title, inline && styles.titleInline]}>{title}</Text>
			{message ? <Text style={styles.message}>{message}</Text> : null}
			{onRetry ? (
				<Pressable
					style={styles.retryButton}
					onPress={onRetry}
					accessibilityRole="button"
					accessibilityLabel={retryLabel}
				>
					<Text style={styles.retryText}>{retryLabel}</Text>
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingHorizontal: 40,
		paddingVertical: 48,
		backgroundColor: tokens.surface.background,
	},
	inline: {
		alignSelf: 'stretch',
		alignItems: 'center',
		paddingHorizontal: 24,
		paddingVertical: 16,
	},
	title: {
		maxWidth: 320,
		fontSize: 20,
		lineHeight: 28,
		fontWeight: '600',
		color: tokens.text.primary,
		marginBottom: 8,
		textAlign: 'center',
	},
	titleInline: {
		fontSize: 16,
		lineHeight: 24,
		marginBottom: 12,
	},
	message: {
		maxWidth: 320,
		fontSize: 16,
		lineHeight: 24,
		color: tokens.text.tertiary,
		marginBottom: 24,
		textAlign: 'center',
	},
	retryButton: {
		minHeight: 44,
		justifyContent: 'center',
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.accent.primary,
	},
	retryText: {
		fontSize: 16,
		color: tokens.text.inverse,
		fontWeight: '600',
	},
});
