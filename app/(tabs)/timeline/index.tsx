import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/constants/tokens';

/**
 * Timeline tab — stub. Full build (horizontal chronological scroll of hologram
 * covers with a synced notch rail) lands in a later step.
 */
export default function TimelineScreen() {
	return (
		<ScrollView
			style={styles.container}
			contentContainerStyle={styles.content}
			contentInsetAdjustmentBehavior="automatic"
		>
			<View style={styles.center}>
				<Text style={styles.title}>Timeline</Text>
				<Text style={styles.subtitle}>
					A chronological scroll through the galaxy’s history is coming here.
				</Text>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.surface.background,
	},
	content: {
		flexGrow: 1,
	},
	center: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 32,
		gap: 8,
	},
	title: {
		fontSize: 18,
		fontWeight: '600',
		color: tokens.text.primary,
	},
	subtitle: {
		fontSize: 14,
		color: tokens.text.secondary,
		textAlign: 'center',
	},
});
