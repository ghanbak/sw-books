import { FieldGroup, Host, Icon, ListItem, Switch, Text } from '@expo/ui';
import { DisclosureGroup } from '@expo/ui/swift-ui';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert } from 'react-native';

import { tokens } from '@/constants/tokens';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// Single source of truth: app.json's expo.version (kept in lockstep with package.json by
// `npm version` → scripts/sync-app-version.mjs).
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

const AFFILIATE_DISCLOSURE =
	'OssusArchives is a participant in the Amazon Associates Program. Tapping “Find on Amazon” opens Amazon’s website. As an Amazon Associate we earn from qualifying purchases — at no extra cost to you.';

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

	const [isExpanded, setIsExpanded] = useState(false);

	async function handleSignOut() {
		const { error } = await supabase.auth.signOut();
		if (error) Alert.alert('Sign-out failed', error.message);
	}

	return (
		<Host style={{ flex: 1 }}>
			<FieldGroup>
				<FieldGroup.Section title="Account">
					<ListItem supportingText={`Signed in with ${capitalize(provider)}`}>{email}</ListItem>
					<ListItem
						supportingText="Aurebesh alphabet coming soon."
						trailing={<Switch value={false} onValueChange={() => {}} disabled />}
					>
						Aurebesh
					</ListItem>
				</FieldGroup.Section>

				<FieldGroup.Section title="About">
					<ListItem trailing={<Text>{`v${APP_VERSION}`}</Text>}>Version</ListItem>
					<DisclosureGroup
						label="Affiliate disclosure"
						isExpanded={isExpanded}
						onIsExpandedChange={setIsExpanded}
					>
						<Text>{AFFILIATE_DISCLOSURE}</Text>
					</DisclosureGroup>
				</FieldGroup.Section>

				<FieldGroup.Section>
					<ListItem
						onPress={handleSignOut}
						trailing={
							<Icon name="rectangle.portrait.and.arrow.right" color={tokens.status.error} />
						}
					>
						Logout
					</ListItem>
				</FieldGroup.Section>
			</FieldGroup>
		</Host>
	);
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
