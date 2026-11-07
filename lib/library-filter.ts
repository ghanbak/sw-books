import type { UserBook } from '@/lib/hooks';

/**
 * The Library tab's filter pills. Single source of truth for membership, kept free
 * of React/Supabase imports so it unit-tests in the node vitest env.
 *
 * Semantics (favorites are independent of the library shelf):
 * - `all`      — any owned/read/want_to_read row; a favorite-only row is NOT in "All".
 * - `favorites`— favorited (regardless of owned/read/want).
 * - `not_read` — owned but unread.
 */
export type LibraryFilter = 'all' | 'favorites' | 'want_to_read' | 'read' | 'not_read';

/** True if this shelf row should appear under the given Library pill. */
export function deriveLibraryFilter(ub: UserBook, filter: LibraryFilter): boolean {
	switch (filter) {
		case 'all':
			return ub.owned || ub.read || ub.want_to_read;
		case 'favorites':
			return ub.favorite;
		case 'want_to_read':
			return ub.want_to_read;
		case 'read':
			return ub.read;
		case 'not_read':
			return ub.owned && !ub.read;
	}
}

/** Pill order on the Library tab. */
export const LIBRARY_FILTER_KEYS: readonly LibraryFilter[] = [
	'all',
	'favorites',
	'want_to_read',
	'read',
	'not_read',
];

export type LibraryView =
	| { kind: 'loading'; pills: readonly LibraryFilter[] }
	| { kind: 'error'; pills: readonly LibraryFilter[] }
	| { kind: 'onboarding'; pills: readonly LibraryFilter[] }
	| { kind: 'list'; pills: readonly LibraryFilter[]; emptyCopy: string };

/**
 * Library tab body. `catalog` is useBooks(), `shelf` is useUserBooks(); `visibleCount` is how
 * many books the current pill shows. Onboarding ("collection awaits") only after both loads
 * finish and the user has no row at all — a favorites-only user gets the pills, so Favorites
 * stays reachable. A pull-to-refresh with rows already loaded keeps the pills on screen.
 */
export function selectLibraryView({
	catalog,
	shelf,
	visibleCount,
	filter,
}: {
	catalog: { loading: boolean; error: string | null; count: number };
	shelf: { loading: boolean; rows: Iterable<UserBook> };
	visibleCount: number;
	filter: LibraryFilter;
}): LibraryView {
	let shelved = false;
	let favorited = false;
	for (const ub of shelf.rows) {
		if (deriveLibraryFilter(ub, 'all')) shelved = true;
		if (ub.favorite) favorited = true;
	}
	const hasRows = shelved || favorited;

	if (visibleCount === 0) {
		const catalogPending = catalog.count === 0;
		if ((catalog.loading && catalogPending) || (shelf.loading && !hasRows)) {
			return { kind: 'loading', pills: [] };
		}
		if (catalog.error && catalogPending) return { kind: 'error', pills: [] };
		if (!hasRows) return { kind: 'onboarding', pills: [] };
	}
	return {
		kind: 'list',
		pills: LIBRARY_FILTER_KEYS,
		emptyCopy: libraryEmptyCopy(filter, { shelved }),
	};
}

/** Copy for a Library pill with no books. */
export function libraryEmptyCopy(filter: LibraryFilter, { shelved }: { shelved: boolean }): string {
	switch (filter) {
		case 'all':
			return shelved
				? 'No books on your shelves.'
				: 'Only favorites so far. Mark a book Owned, Read or Wishlist to shelve it.';
		case 'favorites':
			return 'No favorites yet. Tap the star on a book to add one.';
		case 'want_to_read':
			return 'Your wishlist is empty.';
		case 'read':
			return 'No books marked Read.';
		case 'not_read':
			return 'No unread books you own.';
	}
}
