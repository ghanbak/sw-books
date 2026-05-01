import { LogOut } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/constants/tokens';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
	const { user } = useAuth();

	const displayName =
		(user?.user_metadata?.full_name as string | undefined) ??
		(user?.user_metadata?.name as string | undefined) ??
		user?.email ??
		'Unknown';
	const email = user?.email;
	const provider = user?.app_metadata?.provider ?? 'email';

	async function handleSignOut() {
		const { error } = await supabase.auth.signOut();
		if (error) {
			Alert.alert('Sign-out failed', error.message);
		}
	}

	return (
		<View style={styles.container}>
			<View style={styles.section}>
				<Text style={styles.label}>Signed in as</Text>
				<Text style={styles.value}>{displayName}</Text>
				{email && email !== displayName && <Text style={styles.email}>{email}</Text>}
				<Text style={styles.provider}>via {provider}</Text>
			</View>

			<Pressable style={styles.signOutButton} onPress={handleSignOut}>
				<LogOut size={16} color={tokens.status.error} strokeWidth={2} />
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
		fontSize: 11,
		fontWeight: '600',
		color: tokens.text.hint,
		textTransform: 'uppercase',
		letterSpacing: 1.2,
		marginBottom: 4,
	},
	value: {
		fontSize: 17,
		fontWeight: '500',
		color: tokens.text.primary,
	},
	email: {
		fontSize: 14,
		color: tokens.text.secondary,
		marginTop: 2,
	},
	provider: {
		fontSize: 12,
		color: tokens.text.hint,
		marginTop: 4,
		textTransform: 'capitalize',
	},
	signOutButton: {
		flexDirection: 'row',
		gap: 8,
		paddingVertical: 14,
		borderRadius: 8,
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
		alignItems: 'center',
		justifyContent: 'center',
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
		fontFamily: 'monospace',
	},
});
