'use client';

import { signInWithGoogle } from '@/app/_actions/auth';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

// Errors render inline (as the dev form does) so /login doesn't ship a toast library (#337).
export function SignInButton() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function signIn() {
		setLoading(true);
		setError(null);
		try {
			// On success the action redirects the browser to Google.
			const result = await signInWithGoogle();
			if (result && !result.ok) {
				setError(result.error.message);
				setLoading(false);
			}
		} catch {
			setError('Sign-in request did not complete. Please try again.');
			setLoading(false);
		}
	}

	return (
		<div className="flex flex-col items-center gap-3">
			<Button
				onClick={signIn}
				disabled={loading}
				aria-describedby={error ? 'sign-in-error' : undefined}
			>
				{loading && <Loader2 className="size-4 animate-spin" />}
				Sign in with Google
			</Button>
			{error ? (
				<p id="sign-in-error" role="alert" className="text-destructive-text text-sm">
					{error}
				</p>
			) : null}
		</div>
	);
}
