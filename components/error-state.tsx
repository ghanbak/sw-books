import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/constants/tokens';

type ErrorStateProps = {
	title?: string;
	message?: string | null;
	retryLabel?: string;
	onRetry?: () => void | Promise<void>;
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
}: ErrorStateProps) {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>{title}</Text>
			{message ? <Text style={styles.message}>{message}</Text> : null}
			{onRetry ? (
				<Pressable style={styles.retryButton} onPress={onRetry}>
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
		padding: 24,
		backgroundColor: tokens.surface.background,
	},
	title: {
		fontSize: 17,
		fontWeight: '600',
		color: tokens.text.primary,
		marginBottom: 8,
		textAlign: 'center',
	},
	message: {
		fontSize: 13,
		color: tokens.text.hint,
		marginBottom: 16,
		textAlign: 'center',
	},
	retryButton: {
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: tokens.accent.primary,
	},
	retryText: {
		color: tokens.text.inverse,
		fontWeight: '600',
	},
});
