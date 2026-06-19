import { createAuthServerClient } from '@/lib/supabase-auth';
import { NextResponse } from 'next/server';

/**
 * OAuth (PKCE) callback: exchanges the code for a session, then redirects to
 * `next` (validated to a same-origin path to prevent open-redirects). Honors
 * `x-forwarded-host` so Vercel deployments redirect to the right host.
 *
 * On failure it logs the exact GoTrue error (codes/booleans only — never cookie
 * values) and surfaces a short `?error=` code on /login. This path is prod-only
 * (local dev is ungated), so this is the only window into why a sign-in bounces.
 */
type CallbackError = 'exchange_failed' | 'missing_code';

function loginRedirect(origin: string, error: CallbackError): NextResponse {
	return NextResponse.redirect(`${origin}/login?error=${error}`);
}

export async function GET(request: Request): Promise<NextResponse> {
	const { searchParams, origin } = new URL(request.url);
	const code = searchParams.get('code');
	let next = searchParams.get('next') ?? '/admin/books';
	if (!next.startsWith('/') || next.startsWith('//')) next = '/admin/books';

	if (!code) {
		console.error('[auth/callback] no code in callback url');
		return loginRedirect(origin, 'missing_code');
	}

	const supabase = await createAuthServerClient();
	const { error } = await supabase.auth.exchangeCodeForSession(code);
	if (error) {
		// Surface the failure rather than silently bouncing to /login — the
		// original bug was an "Invalid API key" hidden by this swallowed error.
		console.error(
			`[auth/callback] exchangeCodeForSession failed: ${error.message} (status=${error.status})`,
		);
		return loginRedirect(origin, 'exchange_failed');
	}

	const forwardedHost = request.headers.get('x-forwarded-host');
	if (process.env.NODE_ENV === 'development') return NextResponse.redirect(`${origin}${next}`);
	if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
	return NextResponse.redirect(`${origin}${next}`);
}
