import 'server-only';
import { ADMIN_ENFORCED, isAllowlisted } from './admin-allowlist';
import { createAuthServerClient } from './supabase-auth';

/**
 * The auth gate enforces only in production builds (Vercel). Local `next dev`
 * runs loopback-only, so it stays ungated — the admin is usable locally with no
 * login and no auth env. Any hosted deploy (NODE_ENV=production) requires a
 * Google login whose user id is in ADMIN_USER_IDS.
 */
export class NotAdminError extends Error {
	constructor() {
		super('Not authorized');
		this.name = 'NotAdminError';
	}
}

export type AdminIdentity = { sub: string; email?: string };

/**
 * The signed-in, allowlisted admin — or null. Verifies the JWT with
 * `getClaims()` (never `getSession()`) and checks the id against ADMIN_USER_IDS.
 * In development returns a synthetic local identity (gate disabled).
 */
export async function getAdmin(): Promise<AdminIdentity | null> {
	if (!ADMIN_ENFORCED) return { sub: 'local-dev', email: 'local@dev' };

	const supabase = await createAuthServerClient();
	const { data, error } = await supabase.auth.getClaims();
	const claims = data?.claims;
	if (error || !claims?.sub || !isAllowlisted(claims.sub)) return null;
	return { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined };
}

/** Like getAdmin but throws NotAdminError when not an allowlisted admin. */
export async function requireAdmin(): Promise<AdminIdentity> {
	const admin = await getAdmin();
	if (!admin) throw new NotAdminError();
	return admin;
}
