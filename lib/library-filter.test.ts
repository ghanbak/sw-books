import { describe, expect, it } from 'vitest';

import type { UserBook } from '@/lib/hooks';
import { deriveLibraryFilter } from './library-filter';

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
