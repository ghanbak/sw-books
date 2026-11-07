import { type ActionError, dbError } from './action-errors';
import { type Result, err, ok } from './result';

/**
 * Optimistic concurrency for row updates keyed on `updated_at` (bumped by the
 * `books_updated_at` trigger on every write). The caller sends the `updated_at`
 * it loaded; the UPDATE only matches while the row still carries that value, so
 * a write based on stale data is rejected instead of silently overwriting.
 */

export const CONFLICT_ERROR: ActionError = {
	code: 'CONFLICT',
	message: 'This book changed since you loaded it. Reload, then reapply your edit.',
};

export const NOT_FOUND_ERROR: ActionError = { code: 'NOT_FOUND', message: 'Book not found.' };

type Query<T> = PromiseLike<{ data: T | null; error: unknown }>;

export type GuardedUpdate<Row> = {
	/**
	 * UPDATE … WHERE id = $id AND updated_at = $expected (IS NULL when null),
	 * returning the updated row, or `data: null` when no row matched.
	 */
	update: (expected: string | null) => Query<Row>;
	/** The row's current `updated_at`; `data: null` when the row doesn't exist. */
	current: () => Query<{ updated_at: string | null }>;
};

export async function guardedUpdate<Row>(
	context: string,
	expected: string | null,
	q: GuardedUpdate<Row>,
	log?: (...args: unknown[]) => void,
): Promise<Result<Row>> {
	const updated = await q.update(expected);
	if (updated.error) return err(dbError(context, updated.error, log));
	if (updated.data) return ok(updated.data);

	// Nothing matched: the row is gone, or someone wrote it after we loaded it.
	const now = await q.current();
	if (now.error) return err(dbError(context, now.error, log));
	return err(now.data ? { ...CONFLICT_ERROR } : { ...NOT_FOUND_ERROR });
}
