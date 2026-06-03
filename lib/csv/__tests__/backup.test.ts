import { describe, expect, it } from 'vitest';
import type { Database } from '../../types';
import { BACKUP_COLUMNS, parseBackup, serializeBackup } from '../backup';
import { parseCsv } from '../read';

type BookRow = Database['public']['Tables']['books']['Row'];

function row(overrides: Partial<BookRow>): BookRow {
	return {
		id: '00000000-0000-0000-0000-000000000001',
		slug: 'x',
		title: 'X',
		author: ['Author One'],
		canon: 'Canon',
		cover_image: null,
		created_at: '2026-01-01T00:00:00+00:00',
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
		updated_at: '2026-02-02T00:00:00+00:00',
		...overrides,
	};
}

describe('catalog backup serialize/parse', () => {
	it('header mirrors the DB schema (uuid id kept; no legacy CSV-only columns)', () => {
		const out = serializeBackup([row({})]);
		const header = out.split('\n')[0].split(',');
		expect(header).toEqual([...BACKUP_COLUMNS]);
		expect(header).toContain('id');
		expect(header).toContain('primary_isbn');
		for (const dead of ['characters', 'series', 'asin', 'amazon_affiliate_link', 'updated_at']) {
			expect(header).not.toContain(dead);
		}
	});

	it('orders rows by slug deterministically', () => {
		const out = serializeBackup([
			row({ slug: 'zeta' }),
			row({ slug: 'alpha' }),
			row({ slug: 'mu' }),
		]);
		const slugs = out
			.split('\n')
			.slice(1)
			.filter(Boolean)
			.map((line) => parseCsv(`${out.split('\n')[0]}\n${line}`)[0].slug);
		expect(slugs).toEqual(['alpha', 'mu', 'zeta']);
	});

	it('round-trips a comma-bearing author losslessly (joins on ; not ,)', () => {
		const original = row({ slug: 'comma', author: ['Kevin J. Anderson, Jr.', 'Rebecca Moesta'] });
		const back = parseBackup(serializeBackup([original]));
		expect(back[0].author).toEqual(['Kevin J. Anderson, Jr.', 'Rebecca Moesta']);
	});

	it('preserves multi-ISBN order and primary_isbn', () => {
		const original = row({
			slug: 'isbns',
			isbn: ['9780000000001', '9780000000002'],
			primary_isbn: '9780000000002',
		});
		const back = parseBackup(serializeBackup([original]));
		expect(back[0].isbn).toEqual(['9780000000001', '9780000000002']);
		expect(back[0].primary_isbn).toBe('9780000000002');
	});

	it('preserves NFC-composed accented characters', () => {
		const back = parseBackup(serializeBackup([row({ slug: 'accents', title: 'Café Toketék é' })]));
		expect(back[0].title).toBe('Café Toketék é');
	});

	it('maps empty array cells back to null (nullable) and [] (author)', () => {
		const back = parseBackup(serializeBackup([row({ author: [], isbn: null, format: null })]));
		expect(back[0].author).toEqual([]);
		expect(back[0].isbn).toBeNull();
		expect(back[0].format).toBeNull();
	});

	it('coerces numeric columns and keeps the uuid id', () => {
		const back = parseBackup(serializeBackup([row({ series_order: 3, timeline_order: -232.5 })]));
		expect(back[0].id).toBe('00000000-0000-0000-0000-000000000001');
		expect(back[0].series_order).toBe(3);
		expect(back[0].timeline_order).toBe(-232.5);
	});

	it('is byte-stable across a re-serialize (no-op export produces identical bytes)', () => {
		const rows = [
			row({
				slug: 'b',
				author: ['A', 'B'],
				isbn: ['1', '2'],
				format: ['Hardcover', 'eBook'],
				synopsis: 'has, a comma',
			}),
			row({ slug: 'a', title: 'Aftermath: Empire’s End' }),
		];
		const once = serializeBackup(rows);
		const twice = serializeBackup(parseBackup(once) as unknown as BookRow[]);
		expect(twice).toBe(once);
	});
});
