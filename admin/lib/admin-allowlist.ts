// Single source of truth for the admin gate, dependency-free so the middleware
// (edge), server actions, and the login page all share ONE definition — no drift
// between the places that decide who is an admin.

/** The gate enforces only in production builds (Vercel); local `next dev` is ungated. */
export const ADMIN_ENFORCED = process.env.NODE_ENV === 'production';

/**
 * Hosted deploy (same signal as the gate): production DB only, no repo `data/`
 * on the filesystem. Local-only tools (DB switch, Export to CSV, pin edits) are
 * hidden and their actions refuse.
 */
export const IS_HOSTED = ADMIN_ENFORCED;

function allowlist(): string[] {
	return (process.env.ADMIN_USER_IDS ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

/** Whether the given auth user id is on the ADMIN_USER_IDS allowlist. */
export function isAllowlisted(sub: string | null | undefined): boolean {
	return typeof sub === 'string' && sub.length > 0 && allowlist().includes(sub);
}
