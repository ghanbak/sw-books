'use server';

import { IS_HOSTED } from '@/lib/admin-allowlist';
import { getAdmin } from '@/lib/auth';
import { DB_TARGET_COOKIE, type DbTarget } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/** Switch the admin's active database (local ⇄ prod). Persists in a cookie and
 *  revalidates so the catalog re-queries the chosen target. Local admin only:
 *  a hosted deploy is pinned to prod. */
export async function setDbTarget(target: DbTarget): Promise<void> {
	if (IS_HOSTED || !(await getAdmin())) return;
	if (target !== 'local' && target !== 'prod') return;
	(await cookies()).set(DB_TARGET_COOKIE, target, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
	});
	revalidatePath('/', 'layout');
}
