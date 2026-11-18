'use client';

import { signInWithGoogle } from '@/app/_actions/auth';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function SignInButton() {
	const [loading, setLoading] = useState(false);

	async function signIn() {
		setLoading(true);
		try {
			// On success the action redirects the browser to Google.
			const result = await signInWithGoogle();
			if (result && !result.ok) {
				toast.error(result.error.message);
				setLoading(false);
			}
		} catch {
			toast.error('Sign-in request did not complete. Please try again.');
			setLoading(false);
		}
	}

	return (
		<Button onClick={signIn} disabled={loading}>
			{loading && <Loader2 className="size-4 animate-spin" />}
			Sign in with Google
		</Button>
	);
}
