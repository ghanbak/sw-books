import { isAllowlisted } from '@/lib/admin-allowlist';
import { authConfig, createAuthServerClient } from '@/lib/supabase-auth';
import { DEV_ADMIN_EMAIL } from '@app/admin-screenshot-env';
import { isLocalUrl } from '@app/seed-guard';
import { redirect } from 'next/navigation';
import { DevSignInForm } from './_components/dev-sign-in-form';
import { SignInButton } from './_components/sign-in-button';

export const dynamic = 'force-dynamic';

// Mapped from the callback's `?error=` codes — never echo the raw param into JSX.
const ERROR_MESSAGES: Record<string, string> = {
	exchange_failed: 'Sign-in could not be completed (session exchange failed). Please try again.',
	missing_code: 'Sign-in was interrupted before it completed. Please try again.',
};

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ error?: string }>;
}) {
	// Local dev is ungated — go straight to the catalog.
	if (process.env.NODE_ENV !== 'production') redirect('/admin/books');

	const { error: errorParam } = await searchParams;
	const errorMessage = errorParam
		? (ERROR_MESSAGES[errorParam] ?? ERROR_MESSAGES.exchange_failed)
		: null;

	// Already signed in + allowlisted → in you go.
	let signedInId: string | null = null;
	let signedInEmail: string | null = null;
	const auth = authConfig();
	// Auth on the local stack (npm run admin:screenshot-env): Google OAuth isn't
	// available there, so offer email/password for the seeded dev admin instead.
	const localAuth = auth !== null && isLocalUrl(auth.url);
	if (auth) {
		const supabase = await createAuthServerClient();
		const { data } = await supabase.auth.getClaims();
		const claims = data?.claims;
		if (claims?.sub) {
			if (isAllowlisted(claims.sub)) redirect('/admin/books');
			signedInId = claims.sub;
			signedInEmail = typeof claims.email === 'string' ? claims.email : null;
		}
	}

	return (
		<main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">Ossus Archives — Admin</h1>
				<p className="mt-1 text-muted-foreground text-sm">Sign in to manage the catalog.</p>
			</div>

			{errorMessage ? (
				<p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive-text text-sm">
					{errorMessage}
				</p>
			) : null}

			{signedInId ? (
				<div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
					<p>
						Signed in as <span className="font-medium">{signedInEmail ?? 'your account'}</span> —
						but this account isn’t on the allowlist.
					</p>
					<p className="text-muted-foreground">
						Add this id to <code className="text-foreground">ADMIN_USER_IDS</code> and redeploy:
					</p>
					<code className="block break-all rounded bg-secondary px-2 py-1 font-mono text-xs">
						{signedInId}
					</code>
				</div>
			) : localAuth ? (
				<DevSignInForm defaultEmail={DEV_ADMIN_EMAIL} />
			) : (
				<SignInButton />
			)}
		</main>
	);
}
