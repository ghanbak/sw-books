import type { UserBook } from '@/lib/hooks';

/**
 * Pure helpers for the shelf scanner's data layer (batch add + scan-session draft).
 * Kept free of React/Supabase imports so they unit-test in the node vitest env.
 */

/** Prefix for optimistic placeholder row ids — display-only, never written back. */
const OPTIMISTIC_ID_PREFIX = 'optimistic:';

/**
 * Returns a new userBooks Map with `owned: true` applied for every id, preserving all
 * other shelf flags. Books not yet on any shelf get a placeholder row whose `id` is
 * synthetic; the caller replaces affected entries wholesale (keyed by `book_id`) with
 * the rows the `add_owned_books` RPC returns.
 */
export function applyOwnedOptimistic(
	userBooks: ReadonlyMap<string, UserBook>,
	bookIds: string[],
	userId: string,
): Map<string, UserBook> {
	const next = new Map(userBooks);
	for (const bookId of bookIds) {
		const existing = next.get(bookId);
		if (existing) {
			next.set(bookId, { ...existing, owned: true });
		} else {
			next.set(bookId, {
				id: `${OPTIMISTIC_ID_PREFIX}${bookId}`,
				user_id: userId,
				book_id: bookId,
				owned: true,
				read: false,
				want_to_read: false,
				created_at: null,
				updated_at: null,
			});
		}
	}
	return next;
}

/** Merges server-returned rows into the Map (keyed by book_id), replacing placeholders. */
export function mergeServerRows(
	userBooks: ReadonlyMap<string, UserBook>,
	rows: UserBook[],
): Map<string, UserBook> {
	const next = new Map(userBooks);
	for (const row of rows) {
		next.set(row.book_id, row);
	}
	return next;
}

/**
 * Whether a scan-session draft must be cleared when the auth user changes.
 *
 * The draft's recognized books + pre-selection were computed against the shelf of the
 * user it was created under (`ownerUserId`; null = created signed-out). Rules:
 *   * created signed-out → survives the first sign-in (the deliberate
 *     scan-now-sign-in-at-Add flow), whoever signs in;
 *   * created under user A → survives A signing out/in again, but is cleared the
 *     moment a DIFFERENT account is active — otherwise user B could add user A's books.
 */
export function shouldClearScanDraft(
	ownerUserId: string | null,
	currentUserId: string | null,
): boolean {
	if (ownerUserId === null) return false;
	if (currentUserId === null) return false; // signed out — draft may resume on re-sign-in
	return ownerUserId !== currentUserId;
}
