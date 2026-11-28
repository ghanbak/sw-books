import type { ActionError } from '@app/action-errors';
import { type DbTarget, getDbTarget } from './supabase-admin';

/**
 * The DB target cookie is shared by every tab, and switching it refreshes only
 * the tab that switched. A write therefore takes the target its page rendered
 * with and refuses when the request resolves to another one, so a tab still
 * showing Local can't write to Production (#483, #487). Lives outside the
 * 'use server' action files so `books.ts` and `bulk.ts` share it without
 * exposing it as a callable action. Server-only via `./supabase-admin`.
 */
export async function targetChanged(expected: DbTarget): Promise<ActionError | null> {
	if (expected === (await getDbTarget())) return null;
	return {
		code: 'TARGET_CHANGED',
		message: 'Database target changed in another tab. Reload first.',
	};
}
