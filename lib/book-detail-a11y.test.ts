import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { detailRowLabel } from '@/lib/book-a11y';

// #403: each book-detail row is one VoiceOver stop that speaks "<label>, <value>".
describe('detailRowLabel (#403)', () => {
	it('joins label and value', () => {
		expect(detailRowLabel('Publisher', 'Del Rey')).toBe('Publisher, Del Rey');
		expect(detailRowLabel('Continuity', 'Canon')).toBe('Continuity, Canon');
	});

	it('passes a series position through as shown', () => {
		expect(detailRowLabel('Book', '#1')).toBe('Book, #1');
	});

	it('stringifies a numeric value', () => {
		expect(detailRowLabel('Book', 3)).toBe('Book, 3');
	});

	it('speaks the label alone for a blank value', () => {
		expect(detailRowLabel('Language', '  ')).toBe('Language');
	});

	it('leaves digits alone unless the row opts in as an ISBN', () => {
		expect(detailRowLabel('Timeline', '19 BBY')).toBe('Timeline, 19 BBY');
	});

	it('spaces an ISBN-13 so it reads digit by digit', () => {
		expect(detailRowLabel('ISBN', '9780593157718', { isbn: true })).toBe(
			'ISBN, 9 7 8 0 5 9 3 1 5 7 7 1 8',
		);
	});

	it('drops hyphens and spaces from a formatted ISBN', () => {
		expect(detailRowLabel('ISBN', '978-0-593-15771-8', { isbn: true })).toBe(
			'ISBN, 9 7 8 0 5 9 3 1 5 7 7 1 8',
		);
		expect(detailRowLabel('ISBN', '978 0 593 15771 8', { isbn: true })).toBe(
			'ISBN, 9 7 8 0 5 9 3 1 5 7 7 1 8',
		);
	});

	it('keeps an ISBN-10 check digit X, uppercased', () => {
		expect(detailRowLabel('ISBN', '0-345-33968-x', { isbn: true })).toBe(
			'ISBN, 0 3 4 5 3 3 9 6 8 X',
		);
	});

	it('falls back to the raw value when it is not ISBN-shaped', () => {
		expect(detailRowLabel('ISBN', 'unknown', { isbn: true })).toBe('ISBN, unknown');
	});
});

// Source-level wiring: the component must consume the helper, not just have it exist.
const screen = readFileSync(resolve(__dirname, '..', 'app', 'book', '[id].tsx'), 'utf8');
const rowStart = screen.indexOf('function DetailRow(');
const rowEnd = rowStart === -1 ? -1 : screen.indexOf('\n}\n', rowStart);
const detailRow = rowStart === -1 || rowEnd === -1 ? '' : screen.slice(rowStart, rowEnd);
const rootView = detailRow.match(/<View\s+style=\{\s*styles\.detailRow\s*\}[^>]*>/)?.[0] ?? '';

describe('DetailRow wiring (#403)', () => {
	it('finds the DetailRow component and its row View', () => {
		expect(detailRow).not.toBe('');
		expect(rootView).not.toBe('');
	});

	it('groups the row into one accessible text element', () => {
		expect(rootView).toMatch(/\saccessible[\s>]/);
		expect(rootView).toMatch(/accessibilityRole="text"/);
	});

	it('passes the helper output to accessibilityLabel', () => {
		expect(rootView).toMatch(
			/accessibilityLabel=\{\s*detailRowLabel\(\s*label\s*,\s*value\s*,\s*\{\s*isbn\s*\}\s*,?\s*\)\s*\}/,
		);
	});

	it('opts the ISBN rows in', () => {
		expect(screen).toMatch(/<DetailRow\s[^>]*label="ISBN"[^>]*\sisbn[\s/]/);
	});
});
