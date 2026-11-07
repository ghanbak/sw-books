import { describe, expect, it } from 'vitest';

import type { UserBook } from '@/lib/hooks';
import {
	LIBRARY_FILTER_KEYS,
	deriveLibraryFilter,
	libraryEmptyCopy,
	selectLibraryView,
} from './library-filter';

/** Build a UserBook with all flags off, then apply overrides. */
function ub(
	flags: Partial<Pick<UserBook, 'owned' | 'read' | 'want_to_read' | 'favorite'>>,
): UserBook {
	return {
		id: 'id',
		user_id: 'u',
		book_id: 'b',
		owned: false,
		read: false,
		want_to_read: false,
		favorite: false,
		created_at: null,
		updated_at: null,
		...flags,
	};
}

describe('deriveLibraryFilter', () => {
	it('favorite-only row is excluded from All but shown under Favorites', () => {
		const row = ub({ favorite: true });
		expect(deriveLibraryFilter(row, 'all')).toBe(false);
		expect(deriveLibraryFilter(row, 'favorites')).toBe(true);
		expect(deriveLibraryFilter(row, 'read')).toBe(false);
		expect(deriveLibraryFilter(row, 'want_to_read')).toBe(false);
		expect(deriveLibraryFilter(row, 'not_read')).toBe(false);
	});

	it('owned-only counts as All and Not read', () => {
		const row = ub({ owned: true });
		expect(deriveLibraryFilter(row, 'all')).toBe(true);
		expect(deriveLibraryFilter(row, 'not_read')).toBe(true);
		expect(deriveLibraryFilter(row, 'read')).toBe(false);
	});

	it('owned + read is read, not Not-read', () => {
		const row = ub({ owned: true, read: true });
		expect(deriveLibraryFilter(row, 'read')).toBe(true);
		expect(deriveLibraryFilter(row, 'not_read')).toBe(false);
		expect(deriveLibraryFilter(row, 'all')).toBe(true);
	});

	it('read but not owned is not Not-read', () => {
		const row = ub({ read: true });
		expect(deriveLibraryFilter(row, 'not_read')).toBe(false);
		expect(deriveLibraryFilter(row, 'read')).toBe(true);
		expect(deriveLibraryFilter(row, 'all')).toBe(true);
	});

	it('want-to-read only counts as All and Want', () => {
		const row = ub({ want_to_read: true });
		expect(deriveLibraryFilter(row, 'all')).toBe(true);
		expect(deriveLibraryFilter(row, 'want_to_read')).toBe(true);
		expect(deriveLibraryFilter(row, 'not_read')).toBe(false);
	});

	it('favorite + owned shows under both All and Favorites', () => {
		const row = ub({ owned: true, favorite: true });
		expect(deriveLibraryFilter(row, 'all')).toBe(true);
		expect(deriveLibraryFilter(row, 'favorites')).toBe(true);
	});
});

describe('selectLibraryView', () => {
	const loaded = { loading: false, error: null, count: 10 };
	const idle = (rows: UserBook[]) => ({ loading: false, error: null, rows });

	it('favorites-only user gets the pills (incl. Favorites), not onboarding', () => {
		const view = selectLibraryView({
			catalog: loaded,
			shelf: idle([ub({ favorite: true })]),
			visibleCount: 0,
			filter: 'all',
		});
		expect(view.kind).toBe('list');
		expect(view.pills).toContain('favorites');
		expect(view.kind === 'list' && view.emptyCopy).toMatch(/favorites/i);
	});

	it('no rows at all after both loads is onboarding', () => {
		const view = selectLibraryView({
			catalog: loaded,
			shelf: idle([]),
			visibleCount: 0,
			filter: 'all',
		});
		expect(view.kind).toBe('onboarding');
		expect(view.pills).toEqual([]);
	});

	it('shelf still loading is loading, not onboarding', () => {
		const view = selectLibraryView({
			catalog: loaded,
			shelf: { loading: true, error: null, rows: [] },
			visibleCount: 0,
			filter: 'all',
		});
		expect(view.kind).toBe('loading');
	});

	it('catalog still loading with shelf rows is loading, not an empty pill', () => {
		const view = selectLibraryView({
			catalog: { loading: true, error: null, count: 0 },
			shelf: idle([ub({ owned: true })]),
			visibleCount: 0,
			filter: 'all',
		});
		expect(view.kind).toBe('loading');
	});

	it('catalog failure with nothing to show is error', () => {
		const view = selectLibraryView({
			catalog: { loading: false, error: 'boom', count: 0 },
			shelf: idle([ub({ owned: true })]),
			visibleCount: 0,
			filter: 'all',
		});
		expect(view.kind).toBe('error');
	});

	it('pull-to-refresh with rows keeps the pills', () => {
		const view = selectLibraryView({
			catalog: loaded,
			shelf: { loading: true, error: null, rows: [ub({ owned: true })] },
			visibleCount: 0,
			filter: 'read',
		});
		expect(view.kind).toBe('list');
		expect(view.pills).toEqual(LIBRARY_FILTER_KEYS);
	});

	it('shelf fetch failure with no rows is a shelf error, not onboarding', () => {
		const view = selectLibraryView({
			catalog: loaded,
			shelf: { loading: false, error: 'network down', rows: [] },
			visibleCount: 0,
			filter: 'all',
		});
		expect(view.kind).toBe('error');
		expect(view.kind === 'error' && view.source).toBe('shelf');
		expect(view.pills).toEqual([]);
	});

	it('shelf refetch failure with rows already loaded keeps the list', () => {
		const view = selectLibraryView({
			catalog: loaded,
			shelf: { loading: false, error: 'network down', rows: [ub({ owned: true })] },
			visibleCount: 0,
			filter: 'read',
		});
		expect(view.kind).toBe('list');
	});

	it("empty pill gets that pill's copy", () => {
		const view = selectLibraryView({
			catalog: loaded,
			shelf: idle([ub({ owned: true })]),
			visibleCount: 0,
			filter: 'want_to_read',
		});
		expect(view.kind === 'list' && view.emptyCopy).toBe(
			libraryEmptyCopy('want_to_read', { shelved: true }),
		);
	});
});

describe('libraryEmptyCopy', () => {
	it('every pill has distinct copy', () => {
		const copies = LIBRARY_FILTER_KEYS.map((f) => libraryEmptyCopy(f, { shelved: true }));
		expect(new Set(copies).size).toBe(LIBRARY_FILTER_KEYS.length);
		for (const c of copies) expect(c).not.toBe('No books in this category');
	});

	it('All explains favorites-only shelves', () => {
		expect(libraryEmptyCopy('all', { shelved: false })).toMatch(/favorites/i);
		expect(libraryEmptyCopy('all', { shelved: true })).not.toMatch(/favorites/i);
	});
});
