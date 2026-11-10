import { FieldGroup, Host, Icon, ListItem, Switch, Text } from '@expo/ui';
import { DisclosureGroup, ProgressView } from '@expo/ui/swift-ui';
import { disabled } from '@expo/ui/swift-ui/modifiers';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { tokens } from '@/constants/tokens';

import {
	deleteAccount,
	isAccountGone,
	isAppleUser,
	reauthenticateWithAppleForDeletion,
	signOutLocally,
} from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { runDeleteAccountFlow } from '@/lib/delete-account-flow';
import { PRIVACY_POLICY_URL, openInAppBrowser } from '@/lib/external-link';
import { shelfQueue } from '@/lib/shelf-queue';
import { supabase } from '@/lib/supabase';

// Single source of truth: app.json's expo.version (kept in lockstep with package.json by
// `npm version` → scripts/sync-app-version.mjs).
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

const AFFILIATE_DISCLOSURE =
	'OssusArchives is a participant in the Amazon Associates Program. Tapping “Find on Amazon” opens Amazon’s website. As an Amazon Associate we earn from qualifying purchases — at no extra cost to you.';

/**
 * Account sheet (form sheet) as a native @expo/ui grouped settings form:
 *  - account: signed-in email + the (disabled) Aurebesh toggle,
 *  - about: app version, Privacy Policy link + the Amazon affiliate disclosure (moved here
 *    from the old About screen, which this replaces),
 *  - logout, in its own group,
 *  - delete account (App Store 5.1.1(v)), last and destructive. The privacy policy points
 *    here as "Account → Delete account" (admin/app/privacy/page.tsx); keep them in sync.
 */
export default function ProfileScreen() {
	const { user } = useAuth();

	const email = user?.email ?? 'Signed in';
	const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';

	const [isExpanded, setIsExpanded] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	// Synchronous guard: state updates are async, so a fast double-tap could start two flows.
	const deleteInFlight = useRef(false);

	async function handleSignOut() {
		const { error } = await supabase.auth.signOut();
		if (error) Alert.alert('Sign-out failed', error.message);
		else await shelfQueue.clearAll();
	}

	async function handleDeleteAccount() {
		if (deleteInFlight.current || !user) return;
		deleteInFlight.current = true;
		const apple = isAppleUser(user);
		try {
			const outcome = await runDeleteAccountFlow({
				confirm: () => confirmDeletion(apple),
				isAppleUser: apple,
				reauthenticateWithApple: reauthenticateWithAppleForDeletion,
				onBusy: () => setIsDeleting(true),
				deleteAccount,
				isAccountGone,
				signOutLocally,
			});
			if (outcome.status === 'deleted') {
				// Signed out locally (also when a lost response hid a server-side delete); the
				// root layout's auth guard then replaces this
				// sheet with the login screen (same path as Logout), so no manual navigation here.
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
				Alert.alert('Account deleted', 'Your account and shelves have been removed.');
			} else if (outcome.status === 'failed') {
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
				Alert.alert('Couldn’t delete account', outcome.message);
			}
		} finally {
			deleteInFlight.current = false;
			setIsDeleting(false);
		}
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
					<ListItem
						onPress={() => openInAppBrowser(PRIVACY_POLICY_URL)}
						trailing={<Icon name="arrow.up.right" color={tokens.text.tertiary} />}
					>
						Privacy Policy
					</ListItem>
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

				<FieldGroup.Section>
					<ListItem
						onPress={handleDeleteAccount}
						modifiers={[disabled(isDeleting)]}
						trailing={
							isDeleting ? <ProgressView /> : <Icon name="trash" color={tokens.status.error} />
						}
					>
						<Text textStyle={{ color: tokens.status.error }}>
							{isDeleting ? 'Deleting account…' : 'Delete account'}
						</Text>
					</ListItem>
					<FieldGroup.SectionFooter>
						<Text>Permanently deletes your account and shelves.</Text>
					</FieldGroup.SectionFooter>
				</FieldGroup.Section>
			</FieldGroup>
		</Host>
	);
}

/** Destructive confirmation; resolves true only on "Delete". */
function confirmDeletion(apple: boolean): Promise<boolean> {
	const message = `This permanently deletes your account and all your shelves. It can’t be undone.${
		apple ? '\n\nYou’ll confirm with Apple next.' : ''
	}`;
	return new Promise((resolve) => {
		Alert.alert(
			'Delete account?',
			message,
			[
				{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
				{ text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
			],
			{ cancelable: true, onDismiss: () => resolve(false) },
		);
	});
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
