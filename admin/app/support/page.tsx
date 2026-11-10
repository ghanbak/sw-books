import Link from 'next/link';
import { ContactLink, InfoPage, Section } from '../_components/info-page';

// Public, statically rendered, crawlable — the App Store Connect Support URL.
export const dynamic = 'force-static';

export const metadata = {
	title: 'Support — Ossus Archives',
	description: 'Help with Ossus Archives: contact, account deletion, data, and scanning.',
};

export default function Support() {
	return (
		<InfoPage title="Support">
			<p className="text-muted-foreground text-sm leading-relaxed">
				Ossus Archives is a mobile app for tracking your Star Wars book collection across Canon and
				Legends. Mark books as owned, read, or want to read, and add them by scanning a barcode or a
				shelf of spines.
			</p>

			<Section title="Contact">
				<p>
					Email <ContactLink />. Include your device model, app version (Account → About), and steps
					to reproduce the problem.
				</p>
			</Section>

			<Section title="How do I delete my account?">
				<p>
					In the app, open Account → Delete account. This permanently removes your account and
					shelves. If you can no longer sign in, email <ContactLink /> from the address on your
					account.
				</p>
			</Section>

			<Section title="What data do you keep?">
				<p>
					Your sign-in identifier, email address (as returned by Apple or Google), and the books on
					your shelves. See the{' '}
					<Link className="text-saber-blue underline underline-offset-2" href="/privacy">
						Privacy Policy
					</Link>{' '}
					for details.
				</p>
			</Section>

			<Section title="How does scanning work?">
				<p>
					<strong className="text-foreground">Barcode:</strong> point the camera at the ISBN barcode
					on the back cover. <strong className="text-foreground">Shelf:</strong> capture a row of
					spines and confirm the matches. Recognition runs on your device; camera images are not
					uploaded.
				</p>
				<p>
					If a book isn’t found, it may be missing from the catalog. Email us the title and ISBN and
					we’ll add it.
				</p>
			</Section>

			<Section title="Signing in">
				<p>
					Sign in with Apple or Google. Your shelves sync to that account, so use the same provider
					on every device.
				</p>
			</Section>
		</InfoPage>
	);
}
