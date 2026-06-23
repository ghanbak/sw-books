import { useRouter } from 'expo-router';
import { ChevronRight, LogOut } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/card';
import { tokens } from '@/constants/tokens';
import { useAuth } from '@/lib/auth';
import { loadAurebeshPref, setAurebeshPref } from '@/lib/font-prefs';
import { supabase } from '@/lib/supabase';

/**
 * Account bottom sheet (Figma 142:1220, presented as a form sheet): the signed-in
 * account, an Aurebesh font toggle, an About disclosure, and Logout.
 */
export default function ProfileScreen() {
	const { user } = useAuth();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const [aurebesh, setAurebesh] = useState(false);

	useEffect(() => {
		loadAurebeshPref().then(setAurebesh);
	}, []);

	const email = user?.email ?? 'Signed in';
	const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';

	const toggleAurebesh = (on: boolean) => {
		setAurebesh(on);
		setAurebeshPref(on);
	};

	async function handleSignOut() {
		const { error } = await supabase.auth.signOut();
		if (error) Alert.alert('Sign-out failed', error.message);
	}

	return (
		<View style={[styles.container, { paddingBottom: 20 + insets.bottom }]}>
			<Text style={styles.heading}>Account Settings</Text>

			<Card>
				<View style={styles.accountRow}>
					<Text style={styles.email}>{email}</Text>
					<Text style={styles.provider}>Signed in with {capitalize(provider)}</Text>
				</View>

				<View style={styles.divider} />

				<View style={styles.row}>
					<View style={styles.rowText}>
						<Text style={styles.rowLabel}>Aurebesh</Text>
						<Text style={styles.rowHint}>Render the app in the Aurebesh alphabet.</Text>
					</View>
					<Switch
						value={aurebesh}
						onValueChange={toggleAurebesh}
						trackColor={{ true: tokens.accent.primary, false: tokens.surface.background }}
					/>
				</View>

				<View style={styles.divider} />

				<Pressable
					style={styles.row}
					onPress={() => router.push('/about')}
					accessibilityRole="button"
					accessibilityLabel="About app"
				>
					<Text style={styles.rowLabel}>About app</Text>
					<ChevronRight size={18} color={tokens.accent.primary} strokeWidth={2} />
				</Pressable>
			</Card>

			<Pressable style={styles.logout} onPress={handleSignOut} accessibilityRole="button">
				<LogOut size={16} color={tokens.status.error} strokeWidth={2} />
				<Text style={styles.logoutText}>Logout</Text>
			</Pressable>
		</View>
	);
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.surface.background,
		padding: 16,
		gap: 16,
	},
	heading: {
		fontSize: 22,
		fontWeight: '700',
		color: tokens.text.primary,
		textAlign: 'center',
		marginTop: 8,
	},
	accountRow: {
		gap: 2,
		paddingVertical: 4,
	},
	email: {
		fontSize: 16,
		fontWeight: '600',
		color: tokens.text.primary,
	},
	provider: {
		fontSize: 13,
		color: tokens.text.secondary,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: tokens.border.subtle,
		marginVertical: 10,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 12,
		minHeight: 32,
	},
	rowText: {
		flex: 1,
		gap: 2,
	},
	rowLabel: {
		fontSize: 15,
		color: tokens.text.primary,
	},
	rowHint: {
		fontSize: 12,
		color: tokens.text.hint,
	},
	logout: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		height: 50,
		borderRadius: 12,
		backgroundColor: tokens.status.error,
	},
	logoutText: {
		fontSize: 15,
		fontWeight: '700',
		color: tokens.text.primary,
	},
});
