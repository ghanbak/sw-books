import type { UserBook } from '@/lib/hooks';

/**
 * Shelf state for one book row (Archives, Search). Pure, so it unit-tests in the node
 * vitest env; the screens derive it once per list and `BookCard` renders it (#284).
 */
export type ShelfState = {
	readonly owned: boolean;
	readonly read: boolean;
	readonly wishlist: boolean;
	readonly favorite: boolean;
};

/** Display order for the row badges and the spoken state. */
export const SHELF_STATE_KEYS = ['owned', 'read', 'wishlist', 'favorite'] as const;

const SHELF_STATE_WORDS: Record<keyof ShelfState, string> = {
	owned: 'Owned',
	read: 'Read',
	wishlist: 'Wishlist',
	favorite: 'Favorite',
};

/**
 * One frozen object per flag combination (15 non-empty ones), so equal states are the
 * same reference: `BookCard`'s shallow memo then skips every row whose state didn't change,
 * including after a refetch that replaces every `UserBook` object.
 */
const interned = new Map<number, ShelfState>();

function internShelfState(owned: boolean, read: boolean, wishlist: boolean, favorite: boolean) {
	const key = (owned ? 1 : 0) | (read ? 2 : 0) | (wishlist ? 4 : 0) | (favorite ? 8 : 0);
	let state = interned.get(key);
	if (!state) {
		state = Object.freeze({ owned, read, wishlist, favorite });
		interned.set(key, state);
	}
	return state;
}

/** A row's state, or `undefined` when the book is on no shelf (the row renders as before). */
export function shelfStateOf(row: UserBook | undefined): ShelfState | undefined {
	if (!row) return undefined;
	const owned = row.owned === true;
	const read = row.read === true;
	const wishlist = row.want_to_read === true;
	const favorite = row.favorite === true;
	if (!owned && !read && !wishlist && !favorite) return undefined;
	return internShelfState(owned, read, wishlist, favorite);
}

/**
 * Book id → shelf state for every shelved book. Books on no shelf are absent, so the
 * lookup returns `undefined` for them. Call once per list (memoized on `userBooks`).
 */
export function shelfStatesByBook(
	userBooks: ReadonlyMap<string, UserBook>,
): ReadonlyMap<string, ShelfState> {
	const states = new Map<string, ShelfState>();
	for (const [bookId, row] of userBooks) {
		const state = shelfStateOf(row);
		if (state) states.set(bookId, state);
	}
	return states;
}

/** Spoken shelf state, e.g. "Owned, Read"; `undefined` when there is none. */
export function shelfStateLabel(shelf: ShelfState | undefined): string | undefined {
	if (!shelf) return undefined;
	const words = SHELF_STATE_KEYS.filter((key) => shelf[key]).map((key) => SHELF_STATE_WORDS[key]);
	return words.length > 0 ? words.join(', ') : undefined;
}
