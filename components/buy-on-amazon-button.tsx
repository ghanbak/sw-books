import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, Info } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/constants/tokens';

type Props = {
	url: string;
	onInfoPress?: () => void;
};

export function BuyOnAmazonButton({ url, onInfoPress }: Props) {
	async function handlePress() {
		await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		await WebBrowser.openBrowserAsync(url, {
			presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
		});
	}

	return (
		<View style={styles.row}>
			<Pressable
				style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
				onPress={handlePress}
				accessibilityRole="button"
				accessibilityLabel="Find this book on Amazon"
			>
				<ExternalLink size={18} color={tokens.text.inverse} strokeWidth={2.5} />
				<Text style={styles.label}>Find on Amazon</Text>
			</Pressable>
			{onInfoPress && (
				<Pressable
					style={styles.infoButton}
					onPress={onInfoPress}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel="Affiliate disclosure"
				>
					<Info size={20} color={tokens.text.hint} strokeWidth={2} />
				</Pressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	button: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 10,
		height: 52,
		borderRadius: 100,
		backgroundColor: tokens.accent.primary,
	},
	buttonPressed: {
		opacity: 0.85,
	},
	label: {
		color: tokens.text.inverse,
		fontSize: 16,
		fontWeight: '600',
	},
	infoButton: {
		width: 40,
		height: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
});
