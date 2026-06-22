import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/constants/tokens';

/**
 * About screen — stub, pushed from the Profile sheet. The Amazon affiliate
 * disclosure moves here from the book detail screen in a later step.
 */
export default function AboutScreen() {
	return (
		<ScrollView
			style={styles.container}
			contentContainerStyle={styles.content}
			contentInsetAdjustmentBehavior="automatic"
		>
			<View style={styles.section}>
				<Text style={styles.heading}>OssusArchives</Text>
				<Text style={styles.body}>
					A Star Wars book tracker. The affiliate disclosure and app details will live here.
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
		padding: 20,
		gap: 12,
	},
	section: {
		gap: 8,
	},
	heading: {
		fontSize: 18,
		fontWeight: '600',
		color: tokens.text.primary,
	},
	body: {
		fontSize: 14,
		lineHeight: 20,
		color: tokens.text.secondary,
	},
});
