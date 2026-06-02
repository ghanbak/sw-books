import 'server-only';
import type { Database } from '@app/types';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
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

/** The database the admin is currently pointed at (cookie-driven, defaults to local). */
export async function getDbTarget(): Promise<DbTarget> {
	const value = (await cookies()).get(DB_TARGET_COOKIE)?.value;
	return value === 'prod' ? 'prod' : 'local';
}

/** Service-role client for the currently-selected target. */
export async function getSupabaseAdmin(): Promise<SupabaseClient<Database>> {
	return clientFor(await getDbTarget());
}
