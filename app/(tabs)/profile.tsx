import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/constants/tokens';

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
		backgroundColor: tokens.surface.background,
	},
	section: {
		marginBottom: 24,
	},
	label: {
		fontSize: 13,
		color: tokens.text.hint,
		marginBottom: 4,
	},
	value: {
		fontSize: 17,
		fontWeight: '500',
		color: tokens.text.primary,
	},
	signOutButton: {
		paddingVertical: 14,
		borderRadius: 8,
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
		alignItems: 'center',
		marginBottom: 24,
	},
	signOutText: {
		fontSize: 15,
		fontWeight: '600',
		color: tokens.status.error,
	},
	version: {
		fontSize: 12,
		color: tokens.text.hint,
		textAlign: 'center',
		marginTop: 'auto',
	},
});
