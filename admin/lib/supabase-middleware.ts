import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { ADMIN_ENFORCED, isAllowlisted } from './admin-allowlist';

/**
 * Token refresh + access gate. Enforces only in production (Vercel); local
 * `next dev` is loopback-only and passes through ungated. Middleware is NOT the
 * security boundary on its own (CVE-2025-29927) — every privileged server action
 * re-checks via getAdmin(). This is token refresh + a UX redirect.
 */
function toLogin(request: NextRequest): NextResponse {
	const redirectUrl = request.nextUrl.clone();
	redirectUrl.pathname = '/login';
	return NextResponse.redirect(redirectUrl);
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
	let response = NextResponse.next({ request });
	if (!ADMIN_ENFORCED) return response;

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	// Enforcing but auth isn't configured → fail CLOSED (don't serve /admin).
	if (!url || !key) return toLogin(request);

	const supabase = createServerClient(url, key, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet) {
				for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
				response = NextResponse.next({ request });
				for (const { name, value, options } of cookiesToSet) {
					response.cookies.set(name, value, options);
				}
			},
		},
	});

	// Matcher already scopes this to /admin/*, so any non-admin caller is bounced
	// to /login.
	const { data } = await supabase.auth.getClaims();
	if (!isAllowlisted(data?.claims?.sub)) return toLogin(request);
	return response;
}
