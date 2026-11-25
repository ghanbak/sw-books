import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bookRowLabel } from './book-a11y';

function source(rel: string): string {
	return readFileSync(resolve(__dirname, '..', rel), 'utf8');
}

describe('bookRowLabel', () => {
	it('names a Canon book', () => {
		expect(
			bookRowLabel({ title: 'Light of the Jedi', author: ['Charles Soule'], canon: 'Canon' }),
		).toBe('Light of the Jedi by Charles Soule, Canon');
	});

	it('names a Legends book', () => {
		expect(
			bookRowLabel({ title: 'Heir to the Empire', author: ['Timothy Zahn'], canon: 'Legends' }),
		).toBe('Heir to the Empire by Timothy Zahn, Legends');
	});

	it('joins multiple authors', () => {
		expect(
			bookRowLabel({
				title: 'The Clone Wars Anthology',
				author: ['Claudia Gray', 'Cavan Scott', 'Justina Ireland'],
				canon: 'Canon',
			}),
		).toBe('The Clone Wars Anthology by Claudia Gray, Cavan Scott, Justina Ireland, Canon');
	});

	it('drops the byline when the author list is empty', () => {
		expect(bookRowLabel({ title: 'Untitled', author: [], canon: 'Legends' })).toBe(
			'Untitled, Legends',
		);
	});

	it('passes an unexpected value through, as the badge does, rather than calling it Legends', () => {
		expect(bookRowLabel({ title: 'X', author: ['Y'], canon: 'Disney' })).toBe('X by Y, Disney');
	});

	it('leaves no dangling comma when canon is missing at runtime', () => {
		expect(bookRowLabel({ title: 'X', author: ['Y'], canon: '' })).toBe('X by Y');
		expect(bookRowLabel({ title: 'X', author: ['Y'], canon: null as unknown as string })).toBe(
			'X by Y',
		);
	});
});

describe('bookRowLabel timeline era (#449)', () => {
	const book = { title: 'X', author: ['Y'], canon: 'Canon' };

	it('appends the era last, after canon', () => {
		expect(bookRowLabel({ ...book, timeline_order: -19 })).toBe('X by Y, Canon, 19 BBY');
		expect(bookRowLabel({ ...book, timeline_order: 5 })).toBe('X by Y, Canon, 5 ABY');
	});

	it('speaks zero as 0 ABY, as the row shows it', () => {
		expect(bookRowLabel({ ...book, timeline_order: 0 })).toBe('X by Y, Canon, 0 ABY');
	});

	it('formats a large negative order with grouping', () => {
		expect(bookRowLabel({ ...book, timeline_order: -25793 })).toBe('X by Y, Canon, 25,793 BBY');
	});

	it('adds nothing when the order is null or missing, as the row hides TIMELINE', () => {
		expect(bookRowLabel({ ...book, timeline_order: null })).toBe('X by Y, Canon');
		expect(bookRowLabel({ ...book, timeline_order: undefined })).toBe('X by Y, Canon');
		expect(bookRowLabel(book)).toBe('X by Y, Canon');
	});

	it('keeps reading order with a series: title, series, canon, era', () => {
		expect(bookRowLabel({ ...book, series_name: 'The High Republic', timeline_order: -232 })).toBe(
			'X by Y, The High Republic, Canon, 232 BBY',
		);
	});

	it('appends the era without a series', () => {
		expect(bookRowLabel({ ...book, series_name: null, timeline_order: 4 })).toBe(
			'X by Y, Canon, 4 ABY',
		);
	});

	it('book row hides TIMELINE exactly when timeline_order is null, matching the label', () => {
		expect(source('components/book-card.tsx')).toMatch(/book\.timeline_order != null \?/);
	});
});

describe('bookRowLabel wiring', () => {
	it.each([
		['components/book-card.tsx', 'book'],
		// The Timeline hero shows no series name, so it passes title/author/canon only (#271).
		[
			'app/(tabs)/timeline/index.tsx',
			'\\{\\s*title: item\\.title,\\s*author: item\\.author,\\s*canon: item\\.canon,?\\s*\\}',
		],
	])('%s labels its row with the helper', (path, prop) => {
		const src = source(path);
		expect(src).toMatch(/import \{ bookRowLabel \} from '@\/lib\/book-a11y';/);
		expect(src).toMatch(new RegExp(`accessibilityLabel=\\{bookRowLabel\\(\\s*${prop}\\s*\\)\\}`));
		expect(src).not.toMatch(/accessibilityLabel=\{`[^`]*\.author\.join/);
	});

	it('badge still renders the stored canon value, so the label matches it', () => {
		expect(source('components/ui/canon-badge.tsx')).toMatch(/\{canon\.toUpperCase\(\)\}/);
	});
});
