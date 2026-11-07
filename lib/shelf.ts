import type { Book, UserBook } from '@/lib/hooks';
import { type Result, err, ok } from '@/lib/result';
import type { SpineMatch } from '@/lib/spine-match';
import type { Database } from '@/lib/types';

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
				favorite: false,
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

export type ShelfField = 'owned' | 'read' | 'want_to_read' | 'favorite';

type UserBookInsert = Database['public']['Tables']['user_books']['Insert'];

/** The single server write a shelf toggle needs. */
export type ShelfWrite =
	| { kind: 'insert'; entry: UserBookInsert }
	| { kind: 'update'; id: string; patch: Partial<Pick<UserBook, ShelfField>> }
	| { kind: 'delete'; id: string };

/**
 * Plan one shelf toggle: the optimistic row to show now (`null` = the book leaves
 * every shelf) and the write that makes it true on the server. A book not yet on
 * any shelf gets a placeholder row, replaced by the inserted row on success.
 */
export function planToggle(
	existing: UserBook | undefined,
	bookId: string,
	field: ShelfField,
	userId: string,
): { optimistic: UserBook | null; write: ShelfWrite } {
	if (!existing) {
		const flags = {
			owned: field === 'owned',
			read: field === 'read',
			want_to_read: field === 'want_to_read',
			favorite: field === 'favorite',
		};
		return {
			optimistic: {
				id: `${OPTIMISTIC_ID_PREFIX}${bookId}`,
				user_id: userId,
				book_id: bookId,
				...flags,
				created_at: null,
				updated_at: null,
			},
			write: { kind: 'insert', entry: { user_id: userId, book_id: bookId, ...flags } },
		};
	}
	const value = !existing[field];
	const updated = { ...existing, [field]: value };
	if (!updated.owned && !updated.read && !updated.want_to_read && !updated.favorite) {
		return { optimistic: null, write: { kind: 'delete', id: existing.id } };
	}
	return {
		optimistic: updated,
		write: { kind: 'update', id: existing.id, patch: { [field]: value } },
	};
}

/** True for a display-only placeholder row (`applyOwnedOptimistic` / `planToggle`). */
export function isOptimisticRow(row: UserBook | undefined): boolean {
	return row?.id.startsWith(OPTIMISTIC_ID_PREFIX) ?? false;
}

/**
 * Per-book record of pending shelf writes, shared by every writer in one provider
 * (toggles and `addOwned`). Two jobs:
 *   * in-flight guard — a toggle can't start on a book another write still owns;
 *   * fetch staleness — `touchedSince` tells a refetch which books changed locally
 *     after it started (or are still pending), so it keeps those rows.
 * Claims are ref-counted: `addOwned` claims unconditionally (a batch can't be
 * half-ignored), toggles use `tryClaim`. A write that failed and was rolled back
 * releases with `applied: false`: it left nothing local worth keeping over the
 * server (#133), so it doesn't count as activity once it settles.
 */
export type ShelfWriteTracker = {
	/** Claim one book unless any write on it is pending. */
	tryClaim: (bookId: string) => boolean;
	claim: (bookIds: readonly string[]) => void;
	/** `applied: false` = the write failed and its optimistic change was reverted. */
	release: (bookIds: readonly string[], applied?: boolean) => void;
	/** Monotonic; bumped whenever an applied write settles. Capture it when a fetch starts. */
	seq: () => number;
	/** A write on the book is pending, or an applied write settled after `since`. */
	touchedSince: (bookId: string, since: number) => boolean;
};

export function createShelfWriteTracker(): ShelfWriteTracker {
	const pending = new Map<string, number>();
	const lastActivity = new Map<string, number>();
	let seq = 0;
	const claim = (bookIds: readonly string[]) => {
		for (const id of bookIds) pending.set(id, (pending.get(id) ?? 0) + 1);
	};
	return {
		tryClaim: (bookId) => {
			if (pending.has(bookId)) return false;
			claim([bookId]);
			return true;
		},
		claim,
		release: (bookIds, applied = true) => {
			for (const id of bookIds) {
				const n = (pending.get(id) ?? 0) - 1;
				if (n > 0) pending.set(id, n);
				else pending.delete(id);
				if (applied) {
					seq += 1;
					lastActivity.set(id, seq);
				}
			}
		},
		seq: () => seq,
		touchedSince: (bookId, since) => pending.has(bookId) || (lastActivity.get(bookId) ?? 0) > since,
	};
}

/**
 * One write tracker per signed-in user (#133). Returns the same tracker while the
 * user id is unchanged and a fresh one when it changes, so writes still pending
 * for user A can't make user B's first fetch keep A's local rows.
 */
export function createShelfWriteScope(): (userId: string | null) => ShelfWriteTracker {
	let scope: { userId: string | null; writes: ShelfWriteTracker } | null = null;
	return (userId) => {
		if (scope?.userId !== userId) scope = { userId, writes: createShelfWriteTracker() };
		return scope.writes;
	};
}

/**
 * Rollback target for a failed toggle. If nothing else touched the row since the
 * optimistic write, restore the pre-tap row exactly. If another writer changed it
 * meanwhile (a concurrent `addOwned` setting `owned`), revert only the tapped flag
 * so that change survives.
 */
export function revertToggle(
	current: UserBook | undefined,
	existing: UserBook | undefined,
	optimistic: UserBook | null,
	field: ShelfField,
): UserBook | null {
	if ((current ?? null) === optimistic) return existing ?? null;
	if (!current) return null;
	const reverted = { ...current, [field]: existing?.[field] ?? false };
	return reverted.owned || reverted.read || reverted.want_to_read || reverted.favorite
		? reverted
		: null;
}

/** Row to show after a successful insert; keeps an `owned` a concurrent `addOwned` set. */
export function settleInsert(
	current: UserBook | undefined,
	optimistic: UserBook | null,
	inserted: UserBook,
): UserBook {
	if (!current || current === optimistic) return inserted;
	return { ...inserted, owned: inserted.owned || current.owned };
}

export type ShelfToggleDeps = {
	/** Latest local row for a book (must reflect `set` immediately, not after a render). */
	get: (bookId: string) => UserBook | undefined;
	/** Replace one book's row; `null` removes it. Per-book so other books' writes survive. */
	set: (bookId: string, row: UserBook | null) => void;
	/** Perform the write; `row` is the inserted row for an insert. */
	write: (
		write: ShelfWrite,
	) => Promise<{ row: UserBook | null; error: { message: string } | null }>;
	/** Called once per failed write, after the rollback. */
	onError: (error: { message: string }) => void;
	/** Pending-write registry shared with the provider's other writers (`addOwned`). */
	writes: ShelfWriteTracker;
	/** False once the user the toggle ran for is no longer signed in. */
	isCurrentUser: (userId: string) => boolean;
};

export type ToggleOutcome = 'ok' | 'failed' | 'ignored' | 'stale';

/**
 * Optimistic shelf toggle with a per-book in-flight guard. A tap on a book with any
 * pending write (another toggle, or an `addOwned` batch) is IGNORED (not queued): that
 * write's optimistic state is already on screen, and a rapid double-tap is almost
 * always accidental — queueing it would undo the user's change and double the
 * round-trips. Placeholder rows are never written back (their id isn't a uuid).
 * On failure the tapped flag is rolled back (see `revertToggle`) and `onError` fires.
 * A write that settles after the user changed touches nothing (`'stale'`).
 */
export function createShelfToggler(deps: ShelfToggleDeps) {
	return async function toggle(
		bookId: string,
		field: ShelfField,
		userId: string,
	): Promise<ToggleOutcome> {
		if (isOptimisticRow(deps.get(bookId))) return 'ignored';
		if (!deps.writes.tryClaim(bookId)) return 'ignored';
		let applied = true;
		try {
			const existing = deps.get(bookId);
			const { optimistic, write } = planToggle(existing, bookId, field, userId);
			deps.set(bookId, optimistic);
			const { row, error } = await deps.write(write);
			if (!deps.isCurrentUser(userId)) return 'stale';
			if (error) {
				applied = false;
				deps.set(bookId, revertToggle(deps.get(bookId), existing, optimistic, field));
				deps.onError(error);
				return 'failed';
			}
			if (write.kind === 'insert' && row) {
				deps.set(bookId, settleInsert(deps.get(bookId), optimistic, row));
			}
			return 'ok';
		} finally {
			deps.writes.release([bookId], applied);
		}
	};
}

export type AddOwnedDeps = {
	/** Latest local Map (must reflect `update` immediately, not after a render). */
	current: () => ReadonlyMap<string, UserBook>;
	/** Apply `fn` to the local Map (and to React state, functionally). */
	update: (fn: (prev: ReadonlyMap<string, UserBook>) => Map<string, UserBook>) => void;
	/** The `add_owned_books` RPC. */
	rpc: (
		bookIds: string[],
	) => Promise<{ rows: UserBook[] | null; error: { message: string } | null }>;
	/** Pending-write registry shared with the toggler. */
	writes: ShelfWriteTracker;
	/** False once the user the batch ran for is no longer signed in. */
	isCurrentUser: (userId: string) => boolean;
};

/**
 * Optimistic batch add to the owned shelf. Flips every book immediately, replaces
 * them with the RPC's rows on success. On failure only the batch's own books are
 * reverted, per book (see `revertToggle` on `owned`), so toggles on other books
 * made while the RPC was pending survive (#133).
 */
export function createOwnedAdder(deps: AddOwnedDeps) {
	return async function addOwned(
		bookIds: string[],
		userId: string,
	): Promise<Result<{ rows: UserBook[] }>> {
		// Dedupe defensively: duplicate ids inside ONE statement make Postgres reject
		// the whole insert ("ON CONFLICT DO UPDATE command cannot affect row a second
		// time") — idempotency only protects across calls, not within one.
		const ids = [...new Set(bookIds)];
		if (ids.length === 0) return ok({ rows: [] });

		const before = deps.current();
		const flipped = applyOwnedOptimistic(before, ids, userId);
		const optimistic = new Map(ids.map((id) => [id, flipped.get(id) ?? null]));
		deps.update((prev) => {
			const next = new Map(prev);
			for (const [id, row] of optimistic) if (row) next.set(id, row);
			return next;
		});
		// Toggles on these books are ignored until the RPC settles — otherwise one
		// could write with a placeholder id or race the batch's rows.
		deps.writes.claim(ids);

		let applied = true;
		try {
			const { rows, error } = await deps.rpc(ids);
			const stale = !deps.isCurrentUser(userId); // signed out / switched meanwhile
			if (error) {
				applied = false;
				if (!stale) {
					deps.update((prev) => {
						let next = new Map(prev);
						for (const id of ids) {
							const reverted = revertToggle(
								prev.get(id),
								before.get(id),
								optimistic.get(id) ?? null,
								'owned',
							);
							next = setShelfRow(next, id, reverted);
						}
						return next;
					});
				}
				return err({ code: 'add_failed', message: error.message });
			}
			const result = rows ?? [];
			if (!stale) deps.update((prev) => mergeServerRows(prev, result));
			return ok({ rows: result });
		} finally {
			deps.writes.release(ids, applied);
		}
	};
}

/**
 * Whether a `user_books` fetch result may be applied: it must be the newest fetch
 * started, and the user it was fetched for must still be the signed-in user.
 */
export function isFetchCurrent(f: {
	requestId: number;
	latestRequestId: number;
	requestUserId: string;
	currentUserId: string | null;
}): boolean {
	return f.requestId === f.latestRequestId && f.requestUserId === f.currentUserId;
}

/**
 * Applies a fetched shelf snapshot without clobbering local writes: books for which
 * `keepLocal` is true (a write pending or settled since the fetch started) keep their
 * local row (or absence); every other book takes the server's row.
 */
export function mergeFetchedShelf(
	fetched: readonly UserBook[],
	local: ReadonlyMap<string, UserBook>,
	keepLocal: (bookId: string) => boolean,
): Map<string, UserBook> {
	const next = new Map<string, UserBook>();
	for (const row of fetched) {
		if (!keepLocal(row.book_id)) next.set(row.book_id, row);
	}
	for (const [bookId, row] of local) {
		if (keepLocal(bookId)) next.set(bookId, row);
	}
	return next;
}

/** Per-book Map update for `ShelfToggleDeps.set`. */
export function setShelfRow(
	userBooks: ReadonlyMap<string, UserBook>,
	bookId: string,
	row: UserBook | null,
): Map<string, UserBook> {
	const next = new Map(userBooks);
	if (row) next.set(bookId, row);
	else next.delete(bookId);
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
