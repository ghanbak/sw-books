'use server';

import { authConfig, createAuthServerClient } from '@/lib/supabase-auth';
import { isLocalUrl } from '@app/seed-guard';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Sign-in runs here, not in the browser, so /login ships no supabase-js (#333).
 * The cookie client writes the PKCE verifier (OAuth) or the session (password)
 * through `cookies()`, which is writable inside a server action.
 */
type Result = { ok: true } | { ok: false; error: { code: string; message: string } };
const fail = (code: string, message: string) => ({ ok: false as const, error: { code, message } });

const NOT_CONFIGURED = 'Auth is not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY).';

/**
 * The origin the browser called from. Next's action CSRF check has already
 * matched it against `host` / `x-forwarded-host` (or ADMIN_ALLOWED_ORIGIN), and
 * Supabase only accepts redirect URLs on its allowlist. The path is fixed here.
 */
async function requestOrigin(): Promise<string | null> {
	const origin = (await headers()).get('origin');
	if (!origin) return null;
	try {
		const url = new URL(origin);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
	} catch {
		return null;
	}
}

/** Starts Google OAuth and redirects the browser to the provider. */
export async function signInWithGoogle(): Promise<Result> {
	if (!authConfig()) return fail('NOT_CONFIGURED', NOT_CONFIGURED);
	const origin = await requestOrigin();
	if (!origin) {
		return fail('INVALID', 'Sign-in request had no usable origin. Reload and try again.');
	}

	const supabase = await createAuthServerClient();
	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: 'google',
		options: { redirectTo: `${origin}/auth/callback?next=/admin/books` },
	});
	if (error || !data.url) {
		console.error(`[auth] signInWithOAuth failed: ${error?.message ?? 'no url'}`);
		return fail('AUTH', error?.message ?? 'Sign-in could not start. Please try again.');
	}
	// External URL: Next answers with x-action-redirect and the client router
	// does a full navigation to Google.
	redirect(data.url);
}

/**
 * Email/password sign-in for the seeded dev admin. Only for a build whose auth
 * points at the LOCAL Supabase stack, the same condition the login page uses to
 * render the form; any other stack is refused server-side.
 */
export async function signInWithDevPassword(input: {
	email: string;
	password: string;
}): Promise<Result> {
	const config = authConfig();
	if (!config) return fail('NOT_CONFIGURED', NOT_CONFIGURED);
	if (!isLocalUrl(config.url)) {
		return fail('FORBIDDEN', 'Dev sign-in is only available on the local auth stack.');
	}
	const email = typeof input?.email === 'string' ? input.email : '';
	const password = typeof input?.password === 'string' ? input.password : '';
	if (!email || !password) return fail('INVALID', 'Enter an email and password.');

	const supabase = await createAuthServerClient();
	const { error } = await supabase.auth.signInWithPassword({ email, password });
	if (error) return fail('AUTH', error.message);
	return { ok: true };
}
