import { StyleSheet, Text, View } from 'react-native';

export default function ShelfScreen() {
	return (
		<View style={styles.center}>
			<Text style={styles.emoji}>📚</Text>
			<Text style={styles.title}>Your Bookshelf</Text>
			<Text style={styles.subtitle}>Books you own, have read, or want to read will appear here.</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 32,
	},
	emoji: {
		fontSize: 48,
		marginBottom: 16,
	},
	title: {
		fontSize: 20,
		fontWeight: '600',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 14,
		opacity: 0.5,
		textAlign: 'center',
	},
});
