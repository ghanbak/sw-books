import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Book } from '@/lib/hooks';
import {
	DEFAULT_ARCHIVE_FILTERS,
	buildSeriesOptions,
	filterArchiveBooks,
	matchesArchiveFilters,
} from './archive-filters';
import { DEFAULT_SORT } from './sort';

// Only the fields the filter, series and sort read matter; the rest are cast away.
function book(partial: Partial<Book> & { title: string }): Book {
	return {
		canon: 'Canon',
		type: 'Adult Novel',
		timeline_order: null,
		date_published: null,
		series_name: null,
		series_order: null,
		...partial,
	} as Book;
}

const titles = (books: Book[]) => books.map((b) => b.title);

// Timeline order deliberately disagrees with series order, so the override is visible.
const CATALOG: Book[] = [
	book({
		title: 'XW 3',
		canon: 'Legends',
		series_name: 'X-Wing',
		series_order: 3,
		timeline_order: 1,
	}),
	book({
		title: 'XW 1',
		canon: 'Legends',
		series_name: 'X-Wing',
		series_order: 1,
		timeline_order: 9,
	}),
	book({
		title: 'XW 2 YA',
		canon: 'Legends',
		type: 'YA Novel',
		series_name: 'X-Wing',
		series_order: 2,
		timeline_order: 5,
	}),
	book({ title: 'HR 2', series_name: 'The High Republic', series_order: 2, timeline_order: 2 }),
	book({ title: 'HR 1', series_name: 'The High Republic', series_order: 1, timeline_order: 3 }),
	book({ title: 'Ahsoka', series_name: null, timeline_order: 4 }),
	book({ title: 'Blank', series_name: '', timeline_order: 6 }),
	book({ title: 'Spaces', series_name: '   ', timeline_order: 7 }),
	book({ title: 'Aftermath', series_name: 'aftermath', series_order: 1, timeline_order: 8 }),
];

describe('buildSeriesOptions', () => {
	it('lists each distinct series once with its book count, sorted by name', () => {
		expect(buildSeriesOptions(CATALOG, DEFAULT_ARCHIVE_FILTERS)).toEqual([
			{ name: 'aftermath', count: 1 },
			{ name: 'The High Republic', count: 2 },
			{ name: 'X-Wing', count: 3 },
		]);
	});

	it('excludes books with a null, empty or blank series name', () => {
		const names = buildSeriesOptions(CATALOG, DEFAULT_ARCHIVE_FILTERS).map((o) => o.name);
		expect(names).not.toContain('');
		expect(names.every((n) => n.trim().length > 0)).toBe(true);
	});

	it('trims names so stray whitespace does not split a series', () => {
		const out = buildSeriesOptions(
			[book({ title: 'A', series_name: 'Thrawn' }), book({ title: 'B', series_name: ' Thrawn ' })],
			DEFAULT_ARCHIVE_FILTERS,
		);
		expect(out).toEqual([{ name: 'Thrawn', count: 2 }]);
	});

	it('counts only books passing the canon and type filters, dropping empty series', () => {
		expect(buildSeriesOptions(CATALOG, { canon: 'Canon', type: 'all' })).toEqual([
			{ name: 'aftermath', count: 1 },
			{ name: 'The High Republic', count: 2 },
		]);
		expect(buildSeriesOptions(CATALOG, { canon: 'Legends', type: 'adult' })).toEqual([
			{ name: 'X-Wing', count: 2 },
		]);
	});

	it('ignores the active series when counting', () => {
		expect(buildSeriesOptions(CATALOG, { ...DEFAULT_ARCHIVE_FILTERS, series: 'X-Wing' })).toEqual(
			buildSeriesOptions(CATALOG, DEFAULT_ARCHIVE_FILTERS),
		);
	});

	it('returns an empty list when no book has a series', () => {
		expect(buildSeriesOptions([book({ title: 'Solo' })], DEFAULT_ARCHIVE_FILTERS)).toEqual([]);
	});
});

describe('series filter', () => {
	it('shows only the picked series, in series_order, overriding the sort', () => {
		const out = filterArchiveBooks(
			CATALOG,
			{ ...DEFAULT_ARCHIVE_FILTERS, series: 'X-Wing' },
			DEFAULT_SORT,
		);
		expect(titles(out)).toEqual(['XW 1', 'XW 2 YA', 'XW 3']);
	});

	it('ignores the sort direction while a series is active', () => {
		const out = filterArchiveBooks(
			CATALOG,
			{ ...DEFAULT_ARCHIVE_FILTERS, series: 'X-Wing' },
			{ field: 'timeline_order', direction: 'desc' },
		);
		expect(titles(out)).toEqual(['XW 1', 'XW 2 YA', 'XW 3']);
	});

	it('clearing the series restores the user sort', () => {
		const out = filterArchiveBooks(
			CATALOG,
			{ ...DEFAULT_ARCHIVE_FILTERS, series: null },
			DEFAULT_SORT,
		);
		expect(out).toHaveLength(CATALOG.length);
		expect(titles(out)[0]).toBe('XW 3');
	});

	it('ANDs with canon and type', () => {
		expect(
			titles(
				filterArchiveBooks(
					CATALOG,
					{ canon: 'Legends', type: 'ya', series: 'X-Wing' },
					DEFAULT_SORT,
				),
			),
		).toEqual(['XW 2 YA']);
		expect(
			filterArchiveBooks(CATALOG, { canon: 'Canon', type: 'all', series: 'X-Wing' }, DEFAULT_SORT),
		).toEqual([]);
	});

	it('matches trimmed names and never matches books without a series', () => {
		const padded = book({ title: 'P', series_name: ' X-Wing ' });
		expect(matchesArchiveFilters(padded, { ...DEFAULT_ARCHIVE_FILTERS, series: 'X-Wing' })).toBe(
			true,
		);
		for (const b of CATALOG.filter((x) => !x.series_name?.trim())) {
			expect(matchesArchiveFilters(b, { ...DEFAULT_ARCHIVE_FILTERS, series: '' })).toBe(false);
			expect(matchesArchiveFilters(b, { ...DEFAULT_ARCHIVE_FILTERS, series: 'X-Wing' })).toBe(
				false,
			);
		}
	});

	it('breaks series_order ties and nulls by title, nulls last', () => {
		const out = filterArchiveBooks(
			[
				book({ title: 'Unnumbered B', series_name: 'S', series_order: null }),
				book({ title: 'Two', series_name: 'S', series_order: 2 }),
				book({ title: 'Unnumbered A', series_name: 'S', series_order: null }),
				book({ title: 'One b', series_name: 'S', series_order: 1 }),
				book({ title: 'One a', series_name: 'S', series_order: 1 }),
			],
			{ ...DEFAULT_ARCHIVE_FILTERS, series: 'S' },
			DEFAULT_SORT,
		);
		expect(titles(out)).toEqual(['One a', 'One b', 'Two', 'Unnumbered A', 'Unnumbered B']);
	});

	it('does not mutate the input', () => {
		const copy = [...CATALOG];
		filterArchiveBooks(CATALOG, { ...DEFAULT_ARCHIVE_FILTERS, series: 'X-Wing' }, DEFAULT_SORT);
		expect(CATALOG).toEqual(copy);
	});
});

describe('archives series wiring', () => {
	const screen = readFileSync(resolve(__dirname, '..', 'app/(tabs)/archives/index.tsx'), 'utf8');
	const header = readFileSync(
		resolve(__dirname, '..', 'components/tab-header-actions.tsx'),
		'utf8',
	);

	it('builds the series list with buildSeriesOptions from the catalog and filters', () => {
		expect(screen).toMatch(/buildSeriesOptions\(\s*books,\s*filters\s*\)/);
	});

	it('still filters through filterArchiveBooks with filters (which carry the series)', () => {
		expect(screen).toMatch(/filterArchiveBooks\(\s*books,\s*filters,\s*sort\s*\)/);
		expect(screen).toMatch(/setFilters\(\s*\(f\)\s*=>\s*\(\{\s*\.\.\.f,\s*series\s*\}\)\s*\)/);
	});

	it('passes the series menu props to the header actions', () => {
		expect(screen).toMatch(/<TabHeaderActions[^>]*seriesOptions=\{seriesOptions\}/);
		expect(screen).toMatch(/<TabHeaderActions[^>]*series=\{filters\.series/);
		expect(screen).toMatch(/<TabHeaderActions[^>]*onSeriesChange=\{setSeries\}/);
	});

	it('renders a series menu with a clear action in the header', () => {
		expect(header).toMatch(/accessibilityLabel="Series"/);
		expect(header).toMatch(/onSeriesChange\(\s*null\s*\)/);
	});
});
