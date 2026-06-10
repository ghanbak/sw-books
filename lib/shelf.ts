import type { Book, UserBook } from '@/lib/hooks';
import type { SpineMatch } from '@/lib/spine-match';

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
 * The review queue's initial selection: high-confidence matches are pre-selected;
 * `low` ("double-check these") start unselected; already-owned books are excluded
 * (they render with the owned badge and cannot be re-added).
 */
export function defaultSelection(
	matches: SpineMatch[],
	userBooks: ReadonlyMap<string, UserBook>,
): string[] {
	return matches
		.filter((m) => m.bucket === 'high' && userBooks.get(m.book.id)?.owned !== true)
		.map((m) => m.book.id);
}

/** Toggle one book in the review queue's selection (no-op semantics live in the UI). */
export function toggleSelection(selected: string[], bookId: string): string[] {
	return selected.includes(bookId) ? selected.filter((id) => id !== bookId) : [...selected, bookId];
}

/**
 * Drop owned books from a selection. `defaultSelection` excludes them at
 * draft-creation time, but ownership is LIVE while the draft is frozen — a book
 * marked owned after the scan (another screen, sign-in-at-Add) must fall out of
 * the count, the Add button, and the RPC payload. One derivation, used everywhere.
 */
export function pruneOwned(selected: string[], userBooks: ReadonlyMap<string, UserBook>): string[] {
	return selected.filter((id) => userBooks.get(id)?.owned !== true);
}

/**
 * Swap a review-queue match to a different catalog book (a ranked alternate or a
 * catalog-search pick). Pure draft surgery for the swap sheet:
 *   * the old book and the replacement trade places (the old book becomes the
 *     top alternate, so the swap is always reversible);
 *   * score/margin/bucket/supports are kept — the user overrode the matcher, and
 *     re-scoring a deliberate choice would be noise;
 *   * selection follows the swap: the old id is dropped, the new id is selected
 *     iff the old one was selected AND the replacement isn't already owned
 *     (already-owned books are badged + excluded, same rule as `defaultSelection`).
 */
export function swapMatch(
	matches: SpineMatch[],
	selected: string[],
	fromBookId: string,
	replacement: Book,
	ownedIds: ReadonlySet<string>,
): { matches: SpineMatch[]; selected: string[] } {
	const match = matches.find((m) => m.book.id === fromBookId);
	if (!match || replacement.id === fromBookId) return { matches, selected };
	// Refuse a replacement that's already another match's pick — two rows for the
	// same work would mean duplicate list keys and checkboxes toggling in lockstep.
	if (matches.some((m) => m.book.id === replacement.id)) return { matches, selected };

	const nextMatch: SpineMatch = {
		...match,
		book: replacement,
		alternates: [
			{ book: match.book, score: match.score },
			...match.alternates.filter((a) => a.book.id !== replacement.id),
		],
	};
	const nextMatches = matches.map((m) => (m === match ? nextMatch : m));

	const wasSelected = selected.includes(fromBookId);
	let nextSelected = selected.filter((id) => id !== fromBookId);
	if (wasSelected && !ownedIds.has(replacement.id) && !nextSelected.includes(replacement.id)) {
		nextSelected = [...nextSelected, replacement.id];
	}
	return { matches: nextMatches, selected: nextSelected };
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
