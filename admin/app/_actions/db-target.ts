'use server';

import { IS_HOSTED } from '@/lib/admin-allowlist';
import { getAdmin } from '@/lib/auth';
import { DB_TARGET_COOKIE, type DbTarget } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

type Result = { ok: true } | { ok: false; error: { code: string; message: string } };
const fail = (code: string, message: string) => ({ ok: false as const, error: { code, message } });

/** Switch the admin's active database (local ⇄ prod). Persists in a cookie and
 *  revalidates so the catalog re-queries the chosen target. Local admin only:
 *  a hosted deploy is pinned to prod. */
export async function setDbTarget(target: DbTarget): Promise<Result> {
	if (IS_HOSTED) return fail('READ_ONLY', 'the hosted admin is pinned to production');
	if (!(await getAdmin())) return fail('AUTH', 'not authorized');
	if (target !== 'local' && target !== 'prod') return fail('INVALID', 'unknown database target');
	(await cookies()).set(DB_TARGET_COOKIE, target, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
	});
	revalidatePath('/', 'layout');
	return { ok: true };
}
