import { FieldGroup, Host, ListItem, Switch, Text } from '@expo/ui';
import { Alert } from 'react-native';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const APP_VERSION = '1.0.0';

const AFFILIATE_DISCLOSURE =
	'OssusArchives is a participant in the Amazon Services LLC Associates Program. ' +
	'Tapping “Find on Amazon” opens Amazon’s website. As an Associate we earn from ' +
	'qualifying purchases — at no extra cost to you. Full terms at affiliate-program.amazon.com.';

/**
 * Account sheet (form sheet) as a native @expo/ui grouped settings form:
 *  - account: signed-in email + the (disabled) Aurebesh toggle,
 *  - about: app version + the Amazon affiliate disclosure (moved here from the old About
 *    screen, which this replaces),
 *  - logout, in its own group.
 */
export default function ProfileScreen() {
	const { user } = useAuth();

	const email = user?.email ?? 'Signed in';
	const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';

	async function handleSignOut() {
		const { error } = await supabase.auth.signOut();
		if (error) Alert.alert('Sign-out failed', error.message);
	}

	return (
		<Host style={{ flex: 1 }}>
			<FieldGroup>
				<FieldGroup.Section>
					<ListItem supportingText={`Signed in with ${capitalize(provider)}`}>{email}</ListItem>
					<ListItem
						supportingText="Aurebesh alphabet — coming soon."
						trailing={<Switch value={false} onValueChange={() => {}} disabled />}
					>
						Aurebesh
					</ListItem>
				</FieldGroup.Section>

				<FieldGroup.Section title="About">
					<ListItem trailing={<Text>{`v${APP_VERSION}`}</Text>}>Version</ListItem>
					<ListItem supportingText={AFFILIATE_DISCLOSURE}>Affiliate disclosure</ListItem>
				</FieldGroup.Section>

				<FieldGroup.Section>
					<ListItem onPress={handleSignOut}>Logout</ListItem>
				</FieldGroup.Section>
			</FieldGroup>
		</Host>
	);
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
