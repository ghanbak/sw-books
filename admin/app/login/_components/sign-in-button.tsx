'use client';

import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function SignInButton() {
	const [loading, setLoading] = useState(false);

	async function signIn() {
		const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !key) {
			toast.error('Auth is not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY).');
			return;
		}
		setLoading(true);
		const supabase = createBrowserClient(url, key);
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${window.location.origin}/auth/callback?next=/books` },
		});
		if (error) {
			toast.error(error.message);
			setLoading(false);
		}
		// On success the browser is redirected to Google; no further work here.
	}

	return (
		<Button onClick={signIn} disabled={loading}>
			{loading && <Loader2 className="size-4 animate-spin" />}
			Sign in with Google
		</Button>
	);
}
