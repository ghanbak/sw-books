'use server';

import { getAdmin } from '@/lib/auth';
import { DB_TARGET_COOKIE, type DbTarget } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/** Switch the admin's active database (local ⇄ prod). Persists in a cookie and
 *  revalidates so the catalog re-queries the chosen target. */
export async function setDbTarget(target: DbTarget): Promise<void> {
	if (!(await getAdmin())) return;
	(await cookies()).set(DB_TARGET_COOKIE, target, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
	});
	revalidatePath('/', 'layout');
}
