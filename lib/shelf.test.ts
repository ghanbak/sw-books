import type { Book, UserBook } from '@/lib/hooks';
import {
	applyOwnedOptimistic,
	createShelfWriteTracker,
	defaultSelection,
	isFetchCurrent,
	mergeFetchedShelf,
	mergeServerRows,
	pruneOwned,
	shouldClearScanDraft,
	swapMatch,
	toggleSelection,
} from '@/lib/shelf';
import type { SpineMatch } from '@/lib/spine-match';
import { describe, expect, it } from 'vitest';

// Minimal UserBook factory — only the fields the helpers read matter.
function row(partial: Partial<UserBook> & { book_id: string }): UserBook {
	return {
		id: `row-${partial.book_id}`,
		user_id: 'user-a',
		owned: false,
		read: false,
		want_to_read: false,
		created_at: null,
		updated_at: null,
		...partial,
	} as UserBook;
}

const asMap = (...rows: UserBook[]) => new Map(rows.map((r) => [r.book_id, r]));

describe('applyOwnedOptimistic', () => {
	it('sets owned on an existing row WITHOUT touching read/want_to_read', () => {
		const map = asMap(row({ book_id: 'b1', read: true, want_to_read: true }));
		const next = applyOwnedOptimistic(map, ['b1'], 'user-a');
		expect(next.get('b1')).toMatchObject({ owned: true, read: true, want_to_read: true });
	});

	it('adds a placeholder row for a book not on any shelf', () => {
		const next = applyOwnedOptimistic(new Map(), ['b2'], 'user-a');
		expect(next.get('b2')).toMatchObject({
			book_id: 'b2',
			user_id: 'user-a',
			owned: true,
			read: false,
			want_to_read: false,
		});
		expect(next.get('b2')?.id).toMatch(/^optimistic:/);
	});

	it('does not mutate the input map (snapshot stays a valid revert target)', () => {
		const map = asMap(row({ book_id: 'b1' }));
		applyOwnedOptimistic(map, ['b1', 'b2'], 'user-a');
		expect(map.get('b1')?.owned).toBe(false);
		expect(map.has('b2')).toBe(false);
	});

	it('leaves unrelated entries untouched', () => {
		const other = row({ book_id: 'other', read: true });
		const next = applyOwnedOptimistic(asMap(other), ['b1'], 'user-a');
		expect(next.get('other')).toBe(other);
	});
});

describe('mergeServerRows', () => {
	it('replaces optimistic placeholders with server rows by book_id', () => {
		const optimistic = applyOwnedOptimistic(new Map(), ['b1'], 'user-a');
		const server = row({ book_id: 'b1', id: 'real-uuid', owned: true });
		const next = mergeServerRows(optimistic, [server]);
		expect(next.get('b1')).toBe(server);
	});

	it('keeps entries the server did not return', () => {
		const map = asMap(row({ book_id: 'kept', read: true }));
		const next = mergeServerRows(map, [row({ book_id: 'b1', owned: true })]);
		expect(next.get('kept')?.read).toBe(true);
	});
});

describe('defaultSelection', () => {
	const match = (id: string, bucket: SpineMatch['bucket']): SpineMatch => ({
		book: { id, title: id } as Book,
		score: 1,
		margin: 1,
		bucket,
		supports: 1,
		alternates: [],
	});

	it('pre-selects high-confidence matches only', () => {
		const selected = defaultSelection([match('h1', 'high'), match('l1', 'low')], new Map());
		expect(selected).toEqual(['h1']);
	});

	it('excludes already-owned books from the selection', () => {
		const owned = asMap(row({ book_id: 'h1', owned: true }));
		const selected = defaultSelection([match('h1', 'high'), match('h2', 'high')], owned);
		expect(selected).toEqual(['h2']);
	});

	it('keeps books that are on a shelf but NOT owned (read/want-to-read only)', () => {
		const shelf = asMap(row({ book_id: 'h1', owned: false, read: true }));
		expect(defaultSelection([match('h1', 'high')], shelf)).toEqual(['h1']);
	});
});

describe('toggleSelection', () => {
	it('adds an unselected id and removes a selected one', () => {
		expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b']);
		expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
	});
});

describe('pruneOwned', () => {
	it('drops books that became owned after the draft was created', () => {
		const map = asMap(row({ book_id: 'a', owned: true }), row({ book_id: 'b', read: true }));
		expect(pruneOwned(['a', 'b', 'c'], map)).toEqual(['b', 'c']);
	});

	it('keeps everything when nothing is owned', () => {
		expect(pruneOwned(['a', 'b'], new Map())).toEqual(['a', 'b']);
	});
});

describe('swapMatch', () => {
	const bookOf = (id: string): Book => ({ id, title: `Title ${id}` }) as Book;
	const matchWith = (id: string, alternateIds: string[] = []): SpineMatch => ({
		book: bookOf(id),
		score: 0.8,
		margin: 0.3,
		bucket: 'high',
		supports: 1,
		alternates: alternateIds.map((altId) => ({ book: bookOf(altId), score: 0.5 })),
	});
	const noneOwned: ReadonlySet<string> = new Set();

	it('swaps to a ranked alternate — old book and replacement trade places', () => {
		const { matches } = swapMatch([matchWith('a', ['b', 'c'])], [], 'a', bookOf('b'), noneOwned);
		expect(matches[0].book.id).toBe('b');
		expect(matches[0].alternates.map((alt) => alt.book.id)).toEqual(['a', 'c']);
	});

	it('swaps to a catalog-search pick not among the alternates', () => {
		const { matches } = swapMatch([matchWith('a', ['b'])], [], 'a', bookOf('z'), noneOwned);
		expect(matches[0].book.id).toBe('z');
		expect(matches[0].alternates.map((alt) => alt.book.id)).toEqual(['a', 'b']);
	});

	it('selection follows the swap when the old book was selected', () => {
		const { selected } = swapMatch([matchWith('a', ['b'])], ['a'], 'a', bookOf('b'), noneOwned);
		expect(selected).toEqual(['b']);
	});

	it('stays unselected when the old book was unselected', () => {
		const { selected } = swapMatch([matchWith('a', ['b'])], [], 'a', bookOf('b'), noneOwned);
		expect(selected).toEqual([]);
	});

	it('auto-deselects when swapping to an already-owned book', () => {
		const owned: ReadonlySet<string> = new Set(['b']);
		const { selected } = swapMatch([matchWith('a', ['b'])], ['a'], 'a', bookOf('b'), owned);
		expect(selected).toEqual([]);
	});

	it('never duplicates a selection already held by another match', () => {
		const matches = [matchWith('a', ['b']), matchWith('x')];
		const { selected } = swapMatch(matches, ['a', 'b'], 'a', bookOf('b'), noneOwned);
		expect(selected).toEqual(['b']);
	});

	it('refuses a replacement already held by another match (no duplicate rows)', () => {
		const matches = [matchWith('a', ['x']), matchWith('x')];
		expect(swapMatch(matches, ['a'], 'a', bookOf('x'), noneOwned)).toEqual({
			matches,
			selected: ['a'],
		});
	});

	it('is a no-op for an unknown match or a self-swap', () => {
		const matches = [matchWith('a', ['b'])];
		expect(swapMatch(matches, ['a'], 'ghost', bookOf('b'), noneOwned)).toEqual({
			matches,
			selected: ['a'],
		});
		expect(swapMatch(matches, ['a'], 'a', bookOf('a'), noneOwned)).toEqual({
			matches,
			selected: ['a'],
		});
	});

	it('only touches the targeted match', () => {
		const other = matchWith('x', ['y']);
		const { matches } = swapMatch([matchWith('a', ['b']), other], [], 'a', bookOf('b'), noneOwned);
		expect(matches[1]).toBe(other);
	});
});

describe('shouldClearScanDraft', () => {
	it.each([
		// [ownerUserId, currentUserId, expected]
		[null, null, false], // signed-out draft, still signed out
		[null, 'user-a', false], // signed-out draft survives first sign-in (scan→sign-in-at-Add)
		['user-a', 'user-a', false], // same account
		['user-a', null, false], // owner signed out — draft may resume on re-sign-in
		['user-a', 'user-b', true], // ACCOUNT SWITCH — user B must not add user A's books
	])('owner=%s current=%s → clear=%s', (owner, current, expected) => {
		expect(shouldClearScanDraft(owner, current)).toBe(expected);
	});

	it('clears across an A → signed-out → B sequence (checked at each step)', () => {
		expect(shouldClearScanDraft('user-a', null)).toBe(false); // A signs out: keep
		expect(shouldClearScanDraft('user-a', 'user-b')).toBe(true); // B signs in: clear
	});
});

describe('isFetchCurrent (#108)', () => {
	const base = {
		requestId: 2,
		latestRequestId: 2,
		requestUserId: 'user-a',
		currentUserId: 'user-a',
	};

	it('applies the newest fetch for the signed-in user', () => {
		expect(isFetchCurrent(base)).toBe(true);
	});

	it('drops a fetch that finishes after a newer one started', () => {
		expect(isFetchCurrent({ ...base, requestId: 1 })).toBe(false);
	});

	it('drops a fetch for a different user (account switch)', () => {
		expect(isFetchCurrent({ ...base, currentUserId: 'user-b' })).toBe(false);
	});

	it('drops a fetch that finishes after sign-out', () => {
		expect(isFetchCurrent({ ...base, currentUserId: null })).toBe(false);
	});
});

describe('mergeFetchedShelf + write tracker (#108)', () => {
	const server = (bookId: string, flags: Partial<UserBook>) =>
		row({ id: `srv-${bookId}`, book_id: bookId, ...flags });

	it('keeps a toggle made after the fetch started; other books take server rows', () => {
		const writes = createShelfWriteTracker();
		const local = asMap(server('b1', { owned: true }), server('b2', { read: true }));
		const startSeq = writes.seq(); // fetch starts

		// Toggle b1.read while the fetch is in flight, and it settles before the fetch.
		writes.claim(['b1']);
		const toggled = { ...server('b1', { owned: true }), read: true };
		const afterToggle = new Map(local).set('b1', toggled);
		writes.release(['b1']);

		const fetched = [server('b1', { owned: true }), server('b2', { read: true, owned: true })];
		const next = mergeFetchedShelf(fetched, afterToggle, (id) => writes.touchedSince(id, startSeq));
		expect(next.get('b1')).toBe(toggled);
		expect(next.get('b2')).toMatchObject({ read: true, owned: true });
	});

	it('keeps a book removed locally after the fetch started', () => {
		const writes = createShelfWriteTracker();
		const startSeq = writes.seq();
		writes.claim(['b1']); // clearing the last flag, still pending
		const next = mergeFetchedShelf([server('b1', { read: true })], new Map(), (id) =>
			writes.touchedSince(id, startSeq),
		);
		expect(next.has('b1')).toBe(false);
	});

	it('keeps a write that was pending when the fetch started and settled after', () => {
		const writes = createShelfWriteTracker();
		writes.claim(['b1']);
		const startSeq = writes.seq();
		writes.release(['b1']);
		expect(writes.touchedSince('b1', startSeq)).toBe(true);
	});

	it('applies server rows (incl. removals) for books not written since the fetch started', () => {
		const writes = createShelfWriteTracker();
		writes.claim(['b1']);
		writes.release(['b1']); // settled before the fetch
		const startSeq = writes.seq();
		const local = asMap(server('b1', { owned: true }), server('gone', { read: true }));
		const next = mergeFetchedShelf([server('b1', { owned: true, read: true })], local, (id) =>
			writes.touchedSince(id, startSeq),
		);
		expect(next.get('b1')).toMatchObject({ owned: true, read: true });
		expect(next.has('gone')).toBe(false);
	});
});

describe('createShelfWriteTracker', () => {
	it('a write released as not applied (failed + reverted) is not activity (#133)', () => {
		const writes = createShelfWriteTracker();
		const startSeq = writes.seq();
		writes.claim(['b1']);
		expect(writes.touchedSince('b1', startSeq)).toBe(true); // pending
		writes.release(['b1'], false);
		expect(writes.touchedSince('b1', startSeq)).toBe(false);
	});

	it('refuses tryClaim while any claim on the book is pending (ref-counted)', () => {
		const writes = createShelfWriteTracker();
		writes.claim(['b1']);
		writes.claim(['b1']);
		writes.release(['b1']);
		expect(writes.tryClaim('b1')).toBe(false);
		writes.release(['b1']);
		expect(writes.tryClaim('b1')).toBe(true);
		expect(writes.tryClaim('b2')).toBe(true);
	});
});
