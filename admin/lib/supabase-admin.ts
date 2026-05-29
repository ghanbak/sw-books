import 'server-only';
import type { Database } from '@app/types';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Service-role Supabase client. RLS-bypassing — server-side only. The
 * `server-only` import guarantees it can never be bundled into a client
 * component. Do not use @supabase/ssr here (cookie collisions with the
 * service-role key).
 */
export const supabaseAdmin = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: {
		persistSession: false,
		autoRefreshToken: false,
		detectSessionInUrl: false,
	},
});
