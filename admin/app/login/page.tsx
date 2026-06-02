import { authConfig, createAuthServerClient } from '@/lib/supabase-auth';
import { redirect } from 'next/navigation';
import { SignInButton } from './_components/sign-in-button';

export const dynamic = 'force-dynamic';

function allowlist(): string[] {
	return (process.env.ADMIN_USER_IDS ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export default async function LoginPage() {
	// Local dev is ungated — go straight to the catalog.
	if (process.env.NODE_ENV !== 'production') redirect('/admin/books');

	// Already signed in + allowlisted → in you go.
	let signedInId: string | null = null;
	let signedInEmail: string | null = null;
	if (authConfig()) {
		const supabase = await createAuthServerClient();
		const { data } = await supabase.auth.getClaims();
		const claims = data?.claims;
		if (claims?.sub) {
			if (allowlist().includes(claims.sub)) redirect('/admin/books');
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
			) : (
				<SignInButton />
			)}
		</main>
	);
}
