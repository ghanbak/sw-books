import Link from 'next/link';
import { ContactLink, InfoPage, Section } from '../_components/info-page';

// Public, statically rendered, crawlable — the Google Play account deletion URL. Reviewers
// must reach it without the app, JS, or auth. Copy follows the delete-account Edge Function
// (supabase/functions/delete-account) and app/profile.tsx; keep them in sync.
export const dynamic = 'force-static';

export const metadata = {
	title: 'Delete Your Account — Ossus Archives',
	description: 'How to delete your Ossus Archives account and data, in the app or by email.',
};

export default function DeleteAccount() {
	return (
		<InfoPage title="Delete your account">
			<p className="text-muted-foreground text-sm leading-relaxed">
				You can delete your Ossus Archives account and its data at any time, in the app or by email.
			</p>

			<Section title="In the app">
				<ol className="list-decimal space-y-1 pl-5">
					<li>Sign in and tap the profile icon at the top right (Account and settings).</li>
					<li>Tap Delete account, then Delete to confirm.</li>
					<li>If you signed in with Apple, confirm with Apple when asked.</li>
				</ol>
				<p>
					Deletion happens right away and signs you out. The app also tries to revoke its Sign in
					with Apple or Google access.
				</p>
			</Section>

			<Section title="By email">
				<p>
					If you can’t open the app, email <ContactLink /> from the address on your account and ask
					us to delete it. We’ll delete the account and its shelves, then reply to confirm.
				</p>
			</Section>

			<Section title="What gets deleted">
				<p>
					Your account (sign-in identifier and email address) and every book on your shelves, with
					its owned, read, and want-to-read status.
				</p>
			</Section>

			<Section title="What we keep">
				<p>
					Nothing in the app’s database. Our auth provider (Supabase) may keep security logs and
					backups for a limited period before they expire. The book catalog is shared and isn’t part
					of your account. Deletion is permanent: signing in again later starts a new, empty
					account.
				</p>
				<p>
					See the{' '}
					<Link className="text-saber-blue underline underline-offset-2" href="/privacy">
						Privacy Policy
					</Link>{' '}
					for details.
				</p>
			</Section>
		</InfoPage>
	);
}
