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
