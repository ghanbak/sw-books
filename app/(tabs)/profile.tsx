import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function ProfileScreen() {
	return (
		<View style={styles.container}>
			<View style={styles.section}>
				<Text style={styles.label}>Signed in as</Text>
				<Text style={styles.value}>Dev User (auth bypassed)</Text>
			</View>

			<Pressable style={styles.signOutButton} onPress={() => {}}>
				<Text style={styles.signOutText}>Sign Out</Text>
			</Pressable>

			<Text style={styles.version}>SW Books v1.0.0</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 20,
	},
	section: {
		marginBottom: 24,
	},
	label: {
		fontSize: 13,
		opacity: 0.5,
		marginBottom: 4,
	},
	value: {
		fontSize: 17,
		fontWeight: '500',
	},
	signOutButton: {
		paddingVertical: 14,
		borderRadius: 8,
		backgroundColor: '#f0f0f0',
		alignItems: 'center',
		marginBottom: 24,
	},
	signOutText: {
		fontSize: 15,
		fontWeight: '600',
		color: '#c00',
	},
	version: {
		fontSize: 12,
		opacity: 0.3,
		textAlign: 'center',
		marginTop: 'auto',
	},
});
