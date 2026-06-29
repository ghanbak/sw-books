import { Host, List, ListItem, Switch } from '@expo/ui';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useFontPref } from '@/lib/font-prefs';
import { supabase } from '@/lib/supabase';

/**
 * Account bottom sheet (form sheet) rendered as a native @expo/ui List: the signed-in
 * account, the Aurebesh font toggle (native Switch), an About row, and Logout.
 *
 * v1 native pass — renders as a system settings list (not the dark Card design). Theming to
 * the app's look (dark surfaces, red destructive Logout, the heading) needs on-device work.
 */
export default function ProfileScreen() {
	const { user } = useAuth();
	const router = useRouter();
	const { aurebesh, setAurebesh } = useFontPref();

	const email = user?.email ?? 'Signed in';
	const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';

	async function handleSignOut() {
		const { error } = await supabase.auth.signOut();
		if (error) Alert.alert('Sign-out failed', error.message);
	}

	return (
		<Host style={{ flex: 1 }}>
			<List>
				<ListItem supportingText={`Signed in with ${capitalize(provider)}`}>{email}</ListItem>
				<ListItem
					supportingText="Render the app in the Aurebesh alphabet."
					trailing={<Switch value={aurebesh} onValueChange={setAurebesh} />}
				>
					Aurebesh
				</ListItem>
				<ListItem onPress={() => router.push('/about')}>About app</ListItem>
				<ListItem onPress={handleSignOut}>Logout</ListItem>
			</List>
		</Host>
	);
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
