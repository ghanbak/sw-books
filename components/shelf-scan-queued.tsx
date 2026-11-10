import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { announce, useReduceMotion } from '@/hooks/useAccessibility';
import { exitScanTo } from '@/lib/scan-exit';

/** Shown when Add happened offline: the books are saved locally and sync on reconnect. */
export function ShelfScanQueued({ count, onReset }: { count: number; onReset: () => void }) {
	const router = useRouter();
	const reduceMotion = useReduceMotion();
	const title = count === 1 ? '1 book queued' : `${count} books queued`;
	const detail = `${count === 1 ? "It'll" : "They'll"} be added to Owned when you're back online.`;

	useEffect(() => {
		announce(`${title}. ${detail}`);
	}, [title, detail]);

	const finish = () => {
		onReset();
		exitScanTo(router, '/library');
	};

	return (
		<Animated.View
			style={styles.overlay}
			entering={reduceMotion ? undefined : FadeIn.duration(200)}
		>
			<View style={styles.body}>
				<View
					style={styles.icon}
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
				>
					<SymbolView
						name="clock.arrow.circlepath"
						size={32}
						tintColor={tokens.accent.secondary}
						weight="semibold"
					/>
				</View>
				<Text style={styles.title} accessibilityRole="header">
					{title}
				</Text>
				<Text style={styles.detail}>{detail}</Text>
				<Pressable
					style={styles.primaryButton}
					onPress={finish}
					accessibilityRole="button"
					accessibilityHint="Closes the scanner and opens your library"
				>
					<Text style={styles.primaryButtonText}>Done</Text>
				</Pressable>
				<Pressable
					style={styles.secondaryButton}
					onPress={onReset}
					accessibilityRole="button"
					accessibilityHint="Starts a new shelf scan"
				>
					<Text style={styles.secondaryButtonText}>Scan More</Text>
				</Pressable>
			</View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	overlay: {
		...StyleSheet.absoluteFill,
		backgroundColor: tokens.surface.overlay,
	},
	body: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 32,
		gap: 12,
	},
	icon: {
		width: 72,
		height: 72,
		borderRadius: 36,
		backgroundColor: tokens.surface.card,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 8,
	},
	title: {
		color: tokens.text.primary,
		fontSize: 20,
		fontWeight: '600',
		textAlign: 'center',
	},
	detail: {
		color: tokens.text.secondary,
		fontSize: 14,
		textAlign: 'center',
	},
	primaryButton: {
		marginTop: 12,
		paddingHorizontal: 28,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.accent.primary,
	},
	primaryButtonText: {
		color: tokens.text.inverse,
		fontSize: 14,
		fontWeight: '600',
	},
	secondaryButton: {
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
		alignItems: 'center',
	},
	secondaryButtonText: {
		color: tokens.text.primary,
		fontSize: 14,
		fontWeight: '500',
	},
});
