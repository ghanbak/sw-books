import 'server-only';
import { z } from 'zod';

/**
 * Server-only environment, parsed once at module load so a missing/invalid
 * value fails fast. Local + production are both configured; the admin picks one
 * per request via the DB-target cookie (see lib/supabase-admin.ts). Both keys are
 * service-role (RLS-bypassing) — keep them out of any client bundle.
 */
export const env = z
	.object({
		SUPABASE_LOCAL_URL: z.string().url(),
		SUPABASE_LOCAL_SERVICE_ROLE_KEY: z.string().min(20),
		SUPABASE_PROD_URL: z.string().url(),
		SUPABASE_PROD_SERVICE_ROLE_KEY: z.string().min(20),
	})
	.parse(process.env);
