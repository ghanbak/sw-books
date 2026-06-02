import { createAuthServerClient } from '@/lib/supabase-auth';
import { NextResponse } from 'next/server';

/**
 * OAuth (PKCE) callback: exchanges the code for a session, then redirects to
 * `next` (validated to a same-origin path to prevent open-redirects). Honors
 * `x-forwarded-host` so Vercel deployments redirect to the right host.
 */
export async function GET(request: Request): Promise<NextResponse> {
	const { searchParams, origin } = new URL(request.url);
	const code = searchParams.get('code');
	let next = searchParams.get('next') ?? '/books';
	if (!next.startsWith('/') || next.startsWith('//')) next = '/books';

	if (code) {
		const supabase = await createAuthServerClient();
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			const forwardedHost = request.headers.get('x-forwarded-host');
			if (process.env.NODE_ENV === 'development') {
				return NextResponse.redirect(`${origin}${next}`);
			}
			if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
			return NextResponse.redirect(`${origin}${next}`);
		}
	}
	return NextResponse.redirect(`${origin}/login`);
}
