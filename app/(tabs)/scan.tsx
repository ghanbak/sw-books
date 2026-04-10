import { StyleSheet, Text, View } from 'react-native';

export default function ScanScreen() {
	return (
		<View style={styles.center}>
			<Text style={styles.emoji}>📷</Text>
			<Text style={styles.title}>ISBN Scanner</Text>
			<Text style={styles.subtitle}>Scan a book's barcode to find it in the catalog.</Text>
			<Text style={styles.note}>Coming in Phase 2</Text>
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
		marginBottom: 8,
	},
	note: {
		fontSize: 12,
		opacity: 0.3,
		fontStyle: 'italic',
	},
});
