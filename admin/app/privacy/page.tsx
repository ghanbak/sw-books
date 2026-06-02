import Link from 'next/link';

// Public, statically rendered, crawlable — App Store / Play review and bots must
// reach this without JS or auth.
export const dynamic = 'force-static';

export const metadata = {
	title: 'Privacy Policy — Ossus Archives',
	description: 'How Ossus Archives collects, uses, and protects your data.',
};

const EFFECTIVE = 'June 2, 2026';
const CONTACT = 'privacy@ossusarchives.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="space-y-2">
			<h2 className="font-semibold text-foreground text-lg">{title}</h2>
			<div className="space-y-2 text-muted-foreground text-sm leading-relaxed">{children}</div>
		</section>
	);
}

export default function PrivacyPolicy() {
	return (
		<main className="mx-auto max-w-2xl space-y-8 p-8">
			<header className="space-y-1">
				<Link href="/" className="text-muted-foreground text-sm hover:text-foreground">
					← Ossus Archives
				</Link>
				<h1 className="font-semibold text-2xl tracking-tight">Privacy Policy</h1>
				<p className="text-muted-foreground text-sm">Last updated: {EFFECTIVE}</p>
			</header>

			<p className="text-muted-foreground text-sm leading-relaxed">
				Ossus Archives is a mobile app for tracking your personal Star Wars book collection. This
				policy explains what we collect, how we use it, and your choices. We collect only what the
				app needs to work.
			</p>

			<Section title="Information we collect">
				<p>
					<strong className="text-foreground">Account identifiers.</strong> When you sign in with
					Sign in with Apple or Google Sign-In, we receive a unique user identifier and, depending
					on the provider and your choices, your email address. With Sign in with Apple you may use
					a private relay email; we store whatever the provider returns.
				</p>
				<p>
					<strong className="text-foreground">Your library.</strong> The books you add to your
					shelves and their status (owned, read, want to read) are stored so your collection syncs
					to your account.
				</p>
				<p>
					We do not collect location, contacts, or advertising identifiers, and we do not sell your
					data.
				</p>
			</Section>

			<Section title="How we use your information">
				<p>
					To authenticate you, store and sync your book collection across your devices, and operate
					and improve the app. We use your data only to provide these features.
				</p>
			</Section>

			<Section title="Service providers">
				<p>We share data only with providers that process it on our behalf to run the app:</p>
				<ul className="list-disc space-y-1 pl-5">
					<li>
						<strong className="text-foreground">Supabase</strong> — authentication and database
						(stores your account and library).
					</li>
					<li>
						<strong className="text-foreground">Vercel</strong> — hosting for our web pages.
					</li>
					<li>
						<strong className="text-foreground">Apple and Google</strong> — sign-in providers.
					</li>
				</ul>
				<p>
					These providers are bound to protect your data and use it only to provide their services.
				</p>
			</Section>

			<Section title="Affiliate links">
				<p>
					Some book listings link to retailers. As an Amazon Associate we earn from qualifying
					purchases. These links may set cookies or pass identifiers to the retailer; following them
					is optional and we receive no purchase details that identify you.
				</p>
			</Section>

			<Section title="Data retention and deletion">
				<p>
					We keep your account and library until you delete your account. You can delete your
					account and all associated data from within the app (Settings → Delete account), or by
					emailing us at{' '}
					<a className="text-saber-blue hover:underline" href={`mailto:${CONTACT}`}>
						{CONTACT}
					</a>
					.
				</p>
				<p>
					Deletion removes your account identifier and your shelves, and revokes the sign-in token
					for Sign in with Apple. Deletion is permanent and applies regardless of where you are
					located.
				</p>
			</Section>

			<Section title="Children">
				<p>
					Ossus Archives is not directed to children under 13, and we do not knowingly collect data
					from them. If you believe a child has provided us data, contact us and we will delete it.
				</p>
			</Section>

			<Section title="Changes to this policy">
				<p>
					We may update this policy as the app evolves. Material changes will be reflected by the
					“Last updated” date above.
				</p>
			</Section>

			<Section title="Contact">
				<p>
					Questions? Email{' '}
					<a className="text-saber-blue hover:underline" href={`mailto:${CONTACT}`}>
						{CONTACT}
					</a>
					.
				</p>
			</Section>
		</main>
	);
}
