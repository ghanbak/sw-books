import { describe, expect, it } from 'vitest';

import type { Book } from '@/lib/hooks';
import { eraLabel, groupBooksByYear } from './timeline';

function book(overrides: Partial<Book>): Book {
	return {
		id: Math.random().toString(),
		title: '',
		author: [],
		series_order: null,
		timeline_order: null,
		...overrides,
	} as Book;
}

describe('eraLabel', () => {
	it('formats BBY/ABY with thousands separators', () => {
		expect(eraLabel(-25793)).toBe('25,793 BBY');
		expect(eraLabel(5)).toBe('5 ABY');
		expect(eraLabel(0)).toBe('0 ABY');
		expect(eraLabel(-1)).toBe('1 BBY');
	});
});

describe('groupBooksByYear', () => {
	it('excludes books with no timeline_order', () => {
		const data = groupBooksByYear([
			book({ title: 'A', timeline_order: -100 }),
			book({ title: 'No date', timeline_order: null }),
		]);
		expect(data.books.map((b) => b.title)).toEqual(['A']);
		expect(data.pageToGroup).toHaveLength(1);
	});

	it('sorts oldest -> newest across the zero point', () => {
		const data = groupBooksByYear([
			book({ title: 'New', timeline_order: 19 }),
			book({ title: 'Old', timeline_order: -5000 }),
			book({ title: 'Mid', timeline_order: -1 }),
		]);
		expect(data.books.map((b) => b.title)).toEqual(['Old', 'Mid', 'New']);
	});

	it('groups books that share a date into one notch and keeps page->group aligned', () => {
		const data = groupBooksByYear([
			book({ title: 'B', timeline_order: 1000, series_order: 2 }),
			book({ title: 'A', timeline_order: 1000, series_order: 1 }),
			book({ title: 'C', timeline_order: 2000 }),
		]);
		// one group per distinct date
		expect(data.groups.map((g) => g.label)).toEqual(['1,000 ABY', '2,000 ABY']);
		expect(data.groups[0].count).toBe(2);
		// within a date, ordered by series_order
		expect(data.books.map((b) => b.title)).toEqual(['A', 'B', 'C']);
		// the two same-date books map to the same group; the third to the next
		expect(data.pageToGroup).toEqual([0, 0, 1]);
	});
});
