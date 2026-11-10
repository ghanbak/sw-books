import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { openInAppBrowser } from '@/lib/external-link';

type Props = {
	url: string;
};

export function BuyOnAmazonButton({ url }: Props) {
	return (
		<View style={styles.row}>
			<Pressable
				style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
				onPress={() => openInAppBrowser(url)}
				accessibilityRole="button"
				accessibilityLabel="Find this book on Amazon"
			>
				<SymbolView
					name="arrow.up.forward.app"
					size={18}
					tintColor={tokens.text.inverse}
					weight="semibold"
				/>
				<Text style={styles.label}>Find on Amazon</Text>
			</Pressable>
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
});
