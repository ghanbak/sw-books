import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/constants/tokens';

/**
 * Search tab — stub. Full build (bottom-anchored search bar + live results) lands
 * in a later step, lifting the search logic out of the Archives tab.
 */
export default function SearchScreen() {
	return (
		<ScrollView
			style={styles.container}
			contentContainerStyle={styles.content}
			contentInsetAdjustmentBehavior="automatic"
		>
			<View style={styles.center}>
				<Text style={styles.title}>Search</Text>
				<Text style={styles.subtitle}>Search the archives — coming here.</Text>
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
