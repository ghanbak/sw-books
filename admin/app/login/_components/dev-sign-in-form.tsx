'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';

/**
 * Email/password sign-in for a build whose auth points at the LOCAL Supabase
 * stack (the login page renders it only then). Used to sign in as the seeded dev
 * admin for screenshots; the hosted deploy never shows it. See admin/README.md.
 */
export function DevSignInForm({ defaultEmail }: { defaultEmail: string }) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function signIn(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !key) {
			setError('Auth is not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY).');
			return;
		}
		const form = new FormData(event.currentTarget);
		setPending(true);
		setError(null);
		const { error: signInError } = await createBrowserClient(url, key).auth.signInWithPassword({
			email: String(form.get('email') ?? ''),
			password: String(form.get('password') ?? ''),
		});
		if (signInError) {
			setError(signInError.message);
			setPending(false);
			return;
		}
		// Full navigation so the middleware reads the new session cookie.
		window.location.assign('/admin/books');
	}

	return (
		<form
			onSubmit={signIn}
			className="flex w-full flex-col gap-4 rounded-lg border border-border bg-card p-4 text-left"
		>
			<p className="text-muted-foreground text-xs">Local stack: dev sign-in.</p>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="dev-email">Email</Label>
				<Input
					id="dev-email"
					name="email"
					type="email"
					autoComplete="username"
					defaultValue={defaultEmail}
					required
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="dev-password">Password</Label>
				<Input
					id="dev-password"
					name="password"
					type="password"
					autoComplete="current-password"
					required
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? 'dev-sign-in-error' : undefined}
				/>
			</div>
			{error ? (
				<p id="dev-sign-in-error" role="alert" className="text-destructive-text text-sm">
					{error}
				</p>
			) : null}
			<Button type="submit" disabled={pending}>
				{pending && <Loader2 className="size-4 animate-spin" />}
				Sign in
			</Button>
		</form>
	);
}
