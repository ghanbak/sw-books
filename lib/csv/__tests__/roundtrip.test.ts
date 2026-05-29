import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Database } from '../../types';
import { parseCsv } from '../read';
import { CSV_COLUMNS, stringifyBooksCsv, stringifyCsv } from '../write';

type BookRow = Database['public']['Tables']['books']['Row'];

const BOOKS_CSV = fileURLToPath(new URL('../../../data/books.csv', import.meta.url));

// data/books.csv carries a UTF-8 BOM and mixed \r\n / \n endings. Those are
// formatting concerns the writer normalizes deliberately; strip them on both
// sides so the comparison isolates cell-level fidelity (quoting, ordering).
function normalize(text: string): string {
	return text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

describe('books.csv round-trip', () => {
	const raw = readFileSync(BOOKS_CSV, 'utf-8');

	it('parses every catalog row', () => {
		const records = parseCsv(raw);
		expect(records.length).toBe(185);
		expect(Object.keys(records[0])).toEqual([...CSV_COLUMNS]);
	});

	it('re-stringifies byte-identically (modulo BOM + line endings)', () => {
		const out = stringifyCsv(parseCsv(raw));
		expect(normalize(out)).toBe(normalize(raw));
	});

	it('is idempotent across a second round-trip', () => {
		const once = parseCsv(raw);
		const twice = parseCsv(stringifyCsv(once));
		expect(twice).toEqual(once);
	});
});

describe('stringifyCsv fixtures', () => {
	it('quotes only cells containing quote/comma/newline; leaves semicolons bare', () => {
		const out = stringifyCsv(
			[
				{
					title: 'Plain',
					format: 'Hardcover;Paperback;eBook',
					date_published: 'January 5, 2021',
					synopsis: 'No specials here',
				},
			],
			['title', 'format', 'date_published', 'synopsis'],
		);
		const dataLine = out.split('\n')[1];
		expect(dataLine).toBe('Plain,Hardcover;Paperback;eBook,"January 5, 2021",No specials here');
	});

	it('escapes embedded double quotes by doubling', () => {
		const out = stringifyCsv([{ title: 'a "quoted" word' }], ['title']);
		expect(out.split('\n')[1]).toBe('"a ""quoted"" word"');
	});

	it('preserves NFC-composed accented characters verbatim', () => {
		const title = 'Café Toketék é'; // composed é
		const out = stringifyCsv([{ title }], ['title']);
		const back = parseCsv(out);
		expect(back[0].title).toBe(title);
	});
});

describe('stringifyBooksCsv export writer', () => {
	function row(overrides: Partial<BookRow>): BookRow {
		return {
			id: '1',
			slug: 'x',
			title: 'X',
			author: ['Author One'],
			canon: 'Canon',
			cover_image: null,
			created_at: null,
			date_published: null,
			era: null,
			format: null,
			isbn: null,
			language: null,
			primary_isbn: null,
			publisher: null,
			series_name: null,
			series_order: null,
			synopsis: null,
			timeline_order: null,
			type: 'Adult Novel',
			updated_at: null,
			...overrides,
		};
	}

	it('joins array cells with semicolons', () => {
		const out = stringifyBooksCsv([
			row({ author: ['A', 'B'], isbn: ['111', '222'], format: ['Paperback', 'eBook'] }),
		]);
		const line = out.split('\n')[1];
		expect(line).toContain('A;B');
		expect(line).toContain('111;222');
		expect(line).toContain('Paperback;eBook');
	});

	it('renders nulls and empty arrays as empty cells', () => {
		const out = stringifyBooksCsv([row({ author: [], isbn: null, cover_image: null })]);
		const cells = out.split('\n')[1].split(',');
		// author (idx 3), cover_image (idx 4), isbn (idx 9) all empty
		expect(cells[3]).toBe('');
		expect(cells[4]).toBe('');
		expect(cells[9]).toBe('');
	});

	it('formats Date cells as YYYY-MM-DD', () => {
		const out = stringifyBooksCsv([
			row({ date_published: new Date('2021-01-05T00:00:00Z') as unknown as string }),
		]);
		expect(out.split('\n')[1]).toContain('2021-01-05');
	});

	it('preserves enum casing for canon/type', () => {
		const out = stringifyBooksCsv([row({ canon: 'Legends', type: 'YA Novel' })]);
		const line = out.split('\n')[1];
		expect(line).toContain('Legends');
		expect(line).toContain('YA Novel');
	});

	it('ends with a single trailing newline', () => {
		const out = stringifyBooksCsv([row({})]);
		expect(out.endsWith('\n')).toBe(true);
		expect(out.endsWith('\n\n')).toBe(false);
	});
});
