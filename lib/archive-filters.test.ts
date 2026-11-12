import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Book } from '@/lib/hooks';
import {
	ARCHIVE_CANON_OPTIONS,
	ARCHIVE_TYPE_OPTIONS,
	ARCHIVE_TYPE_VALUES,
	DEFAULT_ARCHIVE_FILTERS,
	filterArchiveBooks,
	matchesArchiveFilters,
} from './archive-filters';
import { DEFAULT_SORT } from './sort';

// Only the fields the filter and sort read matter; the rest are cast away.
function book(partial: Partial<Book> & { title: string }): Book {
	return {
		canon: 'Canon',
		type: 'Adult Novel',
		timeline_order: null,
		date_published: null,
		...partial,
	} as Book;
}

const titles = (books: Book[]) => books.map((b) => b.title);

const CATALOG: Book[] = [
	book({ title: 'Canon YA late', canon: 'Canon', type: 'YA Novel', timeline_order: 30 }),
	book({ title: 'Legends YA', canon: 'Legends', type: 'YA Novel', timeline_order: 5 }),
	book({ title: 'Canon Adult', canon: 'Canon', type: 'Adult Novel', timeline_order: 10 }),
	book({ title: 'Canon MG', canon: 'Canon', type: 'Middle Grade Novel', timeline_order: 20 }),
	book({ title: 'Canon YA early', canon: 'Canon', type: 'YA Novel', timeline_order: 1 }),
	book({ title: 'Canon Comic', canon: 'Canon', type: 'Graphic Novel', timeline_order: 15 }),
	book({ title: 'Legends Adult', canon: 'Legends', type: 'Adult Novel', timeline_order: 2 }),
];

describe('archive type options', () => {
	it('lists All, Adult, YA, Middle Grade in order', () => {
		expect(ARCHIVE_TYPE_OPTIONS.map((o) => o.label)).toEqual([
			'All',
			'Adult',
			'YA',
			'Middle Grade',
		]);
	});

	it('maps each non-All option to its DB type value', () => {
		expect(ARCHIVE_TYPE_VALUES).toEqual({
			adult: 'Adult Novel',
			ya: 'YA Novel',
			middle_grade: 'Middle Grade Novel',
		});
	});

	it('gives every pill a spoken label', () => {
		for (const o of [...ARCHIVE_CANON_OPTIONS, ...ARCHIVE_TYPE_OPTIONS]) {
			expect(o.accessibilityLabel).toBeTruthy();
		}
		expect(ARCHIVE_TYPE_OPTIONS.find((o) => o.key === 'ya')?.accessibilityLabel).toMatch(
			/young adult/i,
		);
	});

	it('defaults to All for both filters', () => {
		expect(DEFAULT_ARCHIVE_FILTERS).toEqual({ canon: 'all', type: 'all' });
	});
});

describe('matchesArchiveFilters', () => {
	it('shows unknown types only under All', () => {
		const comic = book({ title: 'Comic', type: 'Graphic Novel' });
		expect(matchesArchiveFilters(comic, { canon: 'all', type: 'all' })).toBe(true);
		expect(matchesArchiveFilters(comic, { canon: 'all', type: 'adult' })).toBe(false);
		expect(matchesArchiveFilters(comic, { canon: 'all', type: 'ya' })).toBe(false);
		expect(matchesArchiveFilters(comic, { canon: 'all', type: 'middle_grade' })).toBe(false);
	});

	it('ANDs canon and type', () => {
		const legendsYa = book({ title: 'L', canon: 'Legends', type: 'YA Novel' });
		expect(matchesArchiveFilters(legendsYa, { canon: 'Legends', type: 'ya' })).toBe(true);
		expect(matchesArchiveFilters(legendsYa, { canon: 'Canon', type: 'ya' })).toBe(false);
		expect(matchesArchiveFilters(legendsYa, { canon: 'Legends', type: 'adult' })).toBe(false);
	});
});

describe('filterArchiveBooks', () => {
	it('All + All returns every book, sorted', () => {
		const out = filterArchiveBooks(CATALOG, DEFAULT_ARCHIVE_FILTERS, DEFAULT_SORT);
		expect(out).toHaveLength(CATALOG.length);
		expect(titles(out)[0]).toBe('Canon YA early');
	});

	it('YA + Canon shows only canon YA books, in timeline order', () => {
		const out = filterArchiveBooks(CATALOG, { canon: 'Canon', type: 'ya' }, DEFAULT_SORT);
		expect(titles(out)).toEqual(['Canon YA early', 'Canon YA late']);
	});

	it('keeps the chosen sort direction after filtering', () => {
		const out = filterArchiveBooks(
			CATALOG,
			{ canon: 'Canon', type: 'ya' },
			{ field: 'timeline_order', direction: 'desc' },
		);
		expect(titles(out)).toEqual(['Canon YA late', 'Canon YA early']);
	});

	it('type alone spans both canon values', () => {
		const out = filterArchiveBooks(CATALOG, { canon: 'all', type: 'adult' }, DEFAULT_SORT);
		expect(titles(out)).toEqual(['Legends Adult', 'Canon Adult']);
	});

	it('returns an empty list when a combination has no books', () => {
		expect(
			filterArchiveBooks(CATALOG, { canon: 'Legends', type: 'middle_grade' }, DEFAULT_SORT),
		).toEqual([]);
	});

	it('does not mutate the input', () => {
		const copy = [...CATALOG];
		filterArchiveBooks(CATALOG, { canon: 'Canon', type: 'ya' }, DEFAULT_SORT);
		expect(CATALOG).toEqual(copy);
	});
});

describe('archives screen wiring', () => {
	const screen = readFileSync(resolve(__dirname, '..', 'app/(tabs)/archives/index.tsx'), 'utf8');

	it('imports the helper from lib/archive-filters', () => {
		expect(screen).toMatch(/from\s+'@\/lib\/archive-filters'/);
	});

	it('filters through filterArchiveBooks with the active sort', () => {
		expect(screen).toMatch(/filterArchiveBooks\(\s*books,\s*filters,\s*sort\s*\)/);
	});

	it('renders a FilterPills row for each filter', () => {
		expect(screen).toMatch(/options=\{ARCHIVE_CANON_OPTIONS\}/);
		expect(screen).toMatch(/options=\{ARCHIVE_TYPE_OPTIONS\}/);
	});

	it('keeps the shelf prop on BookCard (#284)', () => {
		expect(screen).toMatch(/<BookCard\s+book=\{item\}\s+shelf=\{shelfByBook\.get\(item\.id\)\}/);
	});
});
