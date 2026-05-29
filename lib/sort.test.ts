import type { Book } from '@/lib/hooks';
import { DEFAULT_SORT, parsePublishDate, parseStoredSort, sortBooks } from '@/lib/sort';
import { describe, expect, it } from 'vitest';

// Minimal Book factory — only the fields sortBooks reads matter; the rest are cast away.
function book(partial: Partial<Book> & { title: string }): Book {
	return partial as Book;
}

const titles = (books: Book[]) => books.map((b) => b.title);

describe('parsePublishDate', () => {
	it('parses ISO "YYYY-MM-DD" (the stored format) into a sortable YYYYMMDD int', () => {
		expect(parsePublishDate('1976-11-12')).toBe(19761112);
		expect(parsePublishDate('2025-07-29')).toBe(20250729);
	});

	it('tolerates an ISO time suffix', () => {
		expect(parsePublishDate('2020-06-02T00:00:00Z')).toBe(20200602);
	});

	it('orders ISO dates correctly as integers', () => {
		const oldest = parsePublishDate('1976-11-12') as number;
		const newest = parsePublishDate('2025-07-29') as number;
		expect(oldest).toBeLessThan(newest);
	});

	it('also parses the human "Month D, YYYY" fallback', () => {
		expect(parsePublishDate('January 5, 2021')).toBe(20210105);
		expect(parsePublishDate('December 31, 1999')).toBe(19991231);
	});

	it('is case-insensitive and tolerates surrounding whitespace', () => {
		expect(parsePublishDate('  june 29, 2021 ')).toBe(20210629);
	});

	it('orders correctly as integers', () => {
		const jan = parsePublishDate('January 4, 2022') as number;
		const feb = parsePublishDate('February 1, 2022') as number;
		expect(jan).toBeLessThan(feb);
	});

	it('returns null for null, blank, or unrecognized values', () => {
		expect(parsePublishDate(null)).toBeNull();
		expect(parsePublishDate('')).toBeNull();
		expect(parsePublishDate('2021')).toBeNull();
		expect(parsePublishDate('Q1 2021')).toBeNull();
		expect(parsePublishDate('Smarch 5, 2021')).toBeNull();
	});
});

describe('sortBooks — timeline_order', () => {
	const books = [
		book({ title: 'B', timeline_order: 10 }),
		book({ title: 'A', timeline_order: -232 }),
		book({ title: 'C', timeline_order: 5 }),
	];

	it('sorts ascending', () => {
		expect(titles(sortBooks(books, { field: 'timeline_order', direction: 'asc' }))).toEqual([
			'A',
			'C',
			'B',
		]);
	});

	it('sorts descending', () => {
		expect(titles(sortBooks(books, { field: 'timeline_order', direction: 'desc' }))).toEqual([
			'B',
			'C',
			'A',
		]);
	});

	it('sinks null keys to the end in both directions', () => {
		const withNull = [
			book({ title: 'Z', timeline_order: null }),
			book({ title: 'A', timeline_order: 1 }),
			book({ title: 'B', timeline_order: 2 }),
		];
		expect(titles(sortBooks(withNull, { field: 'timeline_order', direction: 'asc' }))).toEqual([
			'A',
			'B',
			'Z',
		]);
		expect(titles(sortBooks(withNull, { field: 'timeline_order', direction: 'desc' }))).toEqual([
			'B',
			'A',
			'Z',
		]);
	});
});

describe('sortBooks — date_published', () => {
	const books = [
		book({ title: 'B', date_published: '2021-06-29' }),
		book({ title: 'A', date_published: '2021-01-05' }),
		book({ title: 'C', date_published: '2022-01-04' }),
	];

	it('sorts ascending (oldest first) by parsed date', () => {
		expect(titles(sortBooks(books, { field: 'date_published', direction: 'asc' }))).toEqual([
			'A',
			'B',
			'C',
		]);
	});

	it('sorts descending (newest first)', () => {
		expect(titles(sortBooks(books, { field: 'date_published', direction: 'desc' }))).toEqual([
			'C',
			'B',
			'A',
		]);
	});

	it('sinks unparseable/null dates to the end in both directions', () => {
		const messy = [
			book({ title: 'X', date_published: null }),
			book({ title: 'Y', date_published: 'sometime in 2021' }),
			book({ title: 'A', date_published: 'March 1, 2020' }),
		];
		expect(titles(sortBooks(messy, { field: 'date_published', direction: 'asc' }))).toEqual([
			'A',
			'X',
			'Y',
		]);
		expect(titles(sortBooks(messy, { field: 'date_published', direction: 'desc' }))).toEqual([
			'A',
			'X',
			'Y',
		]);
	});
});

describe('sortBooks — tiebreaker and immutability', () => {
	it('breaks ties on title ascending even when direction is desc', () => {
		const tied = [
			book({ title: 'Charlie', timeline_order: 1 }),
			book({ title: 'Alpha', timeline_order: 1 }),
			book({ title: 'Bravo', timeline_order: 1 }),
		];
		expect(titles(sortBooks(tied, { field: 'timeline_order', direction: 'desc' }))).toEqual([
			'Alpha',
			'Bravo',
			'Charlie',
		]);
	});

	it('does not mutate the input array', () => {
		const input = [
			book({ title: 'B', timeline_order: 2 }),
			book({ title: 'A', timeline_order: 1 }),
		];
		const snapshot = titles(input);
		sortBooks(input, { field: 'timeline_order', direction: 'asc' });
		expect(titles(input)).toEqual(snapshot);
	});
});

describe('parseStoredSort', () => {
	it('returns the stored value when valid', () => {
		expect(parseStoredSort('{"field":"date_published","direction":"desc"}')).toEqual({
			field: 'date_published',
			direction: 'desc',
		});
	});

	it('falls back to DEFAULT_SORT for null or malformed JSON', () => {
		expect(parseStoredSort(null)).toEqual(DEFAULT_SORT);
		expect(parseStoredSort('not json')).toEqual(DEFAULT_SORT);
	});

	it('falls back to DEFAULT_SORT for out-of-union field or direction', () => {
		expect(parseStoredSort('{"field":"timeline_order","direction":"sideways"}')).toEqual(
			DEFAULT_SORT,
		);
		expect(parseStoredSort('{"field":"pages","direction":"asc"}')).toEqual(DEFAULT_SORT);
	});
});
