import 'server-only';
import type { Database } from '@app/types';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ADMIN_ENFORCED } from './admin-allowlist';
import { env } from './env';

/**
 * Service-role Supabase client, RLS-bypassing and server-side only (the
 * `server-only` import guarantees it can never be bundled into a client
 * component). The admin targets either the local or the production database,
 * chosen per request from the `admin-db-target` cookie — so the in-app switch
 * takes effect immediately. Do not use @supabase/ssr here (cookie collisions
 * with the service-role key).
 */
export type DbTarget = 'local' | 'prod';
export const DB_TARGET_COOKIE = 'admin-db-target';

const CLIENT_OPTS = {
	auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

function clientFor(target: DbTarget): SupabaseClient<Database> {
	const url = target === 'prod' ? env.SUPABASE_PROD_URL : env.SUPABASE_LOCAL_URL;
	const key =
		target === 'prod' ? env.SUPABASE_PROD_SERVICE_ROLE_KEY : env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;
	return createClient<Database>(url, key, CLIENT_OPTS);
}

/**
 * The database the admin is currently pointed at (cookie-driven). With no cookie
 * yet, a hosted/production deploy defaults to `prod` (the local stack at
 * 127.0.0.1 is unreachable from Vercel — querying it throws "fetch failed");
 * local `next dev` defaults to `local`.
 */
export async function getDbTarget(): Promise<DbTarget> {
	const value = (await cookies()).get(DB_TARGET_COOKIE)?.value;
	if (value === 'prod') return 'prod';
	if (value === 'local') return 'local';
	return ADMIN_ENFORCED ? 'prod' : 'local';
}

/** Service-role client for the currently-selected target. */
export async function getSupabaseAdmin(): Promise<SupabaseClient<Database>> {
	return clientFor(await getDbTarget());
}
