import 'server-only';
import { z } from 'zod';

/**
 * Server-only environment, parsed once at module load so a missing/invalid
 * value fails fast instead of surfacing as a confusing runtime error. The
 * `server-only` import makes any client-component import a build error.
 */
export const env = z
	.object({
		SUPABASE_URL: z.string().url(),
		SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
	})
	.parse(process.env);
