import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Token refresh + access gate. Enforces only in production (Vercel); local
 * `next dev` is loopback-only and passes through ungated. Middleware is NOT the
 * security boundary on its own (CVE-2025-29927) — every privileged server action
 * re-checks via getAdmin(). This is token refresh + a UX redirect.
 */
const ENFORCE = process.env.NODE_ENV === 'production';

function allowlist(): string[] {
	return (process.env.ADMIN_USER_IDS ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
	let response = NextResponse.next({ request });
	if (!ENFORCE) return response;

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !key) return response; // auth not configured — nothing to refresh

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
	const sub = data?.claims?.sub;
	const isAdmin = !!sub && allowlist().includes(sub);
	if (!isAdmin) {
		const redirectUrl = request.nextUrl.clone();
		redirectUrl.pathname = '/login';
		return NextResponse.redirect(redirectUrl);
	}
	return response;
}
