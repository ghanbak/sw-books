import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cookie-based Supabase client for the *user session* (who is logged in). This
 * is the auth side, kept entirely separate from the service-role data client in
 * supabase-admin.ts — never mix @supabase/ssr into the service-role key.
 *
 * Uses the publishable (anon) key of the production Supabase project, where
 * Google OAuth and the owner's account live. Identity is always verified against
 * prod regardless of which database the data layer is pointed at (the switch).
 */
export function authConfig(): { url: string; key: string } | null {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!url || !key) return null;
	return { url, key };
}

export async function createAuthServerClient() {
	const config = authConfig();
	if (!config) {
		throw new Error(
			'Auth not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
		);
	}
	const cookieStore = await cookies();
	return createServerClient(config.url, config.key, {
		cookies: {
			getAll() {
				return cookieStore.getAll();
			},
			setAll(cookiesToSet) {
				try {
					for (const { name, value, options } of cookiesToSet) {
						cookieStore.set(name, value, options);
					}
				} catch {
					// Called from a Server Component (can't write cookies) — the
					// middleware refreshes the session, so this is safe to ignore.
				}
			},
		},
	});
}
