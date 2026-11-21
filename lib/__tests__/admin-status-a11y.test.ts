// Status announcements for the catalog filter and new-book search, plus per-source
// Prefill names and dt/dd candidate markup (#356). Helpers are pure; the wiring is
// checked at the source (no DOM in this suite).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { candidateIsEmpty, prefillLabel, searchStatusLabel } from '../../admin/lib/search-a11y';
import { filterStatusLabel } from '../../admin/lib/table-a11y';

const read = (p: string) => {
	try {
		return readFileSync(resolve(__dirname, '../../admin', p), 'utf-8');
	} catch {
		return '';
	}
};

/** The source between two unique anchors; empty when either is missing. */
function between(src: string, from: string, to: string): string {
	const start = src.indexOf(from);
	if (start < 0) return '';
	const end = src.indexOf(to, start + from.length);
	return end < 0 ? '' : src.slice(start, end);
}

const match = { isbn: ['9780000000001'], publisher: 'Del Rey', date_published: '2017-04-11' };
const none = { isbn: [], publisher: null, date_published: null };

describe('filterStatusLabel', () => {
	it('zero rows', () => {
		expect(filterStatusLabel(0, 185, '')).toBe('No books match');
		expect(filterStatusLabel(0, 185, 'Missing ISBN')).toBe('No books match Missing ISBN');
	});

	it('partial rows', () => {
		expect(filterStatusLabel(4, 185, '')).toBe('4 of 185 books');
		expect(filterStatusLabel(1, 185, '')).toBe('1 of 185 books');
	});

	it('all rows', () => {
		expect(filterStatusLabel(185, 185, '')).toBe('All 185 books');
	});

	it('names the active sidebar filter', () => {
		expect(filterStatusLabel(4, 185, 'Missing ISBN')).toBe('4 books match Missing ISBN');
		expect(filterStatusLabel(1, 185, 'Wiki · Missing page')).toBe(
			'1 book matches Wiki · Missing page',
		);
	});
});

describe('candidateIsEmpty', () => {
	it('is empty with no ISBN, publisher or date', () => {
		expect(candidateIsEmpty(none)).toBe(true);
		expect(candidateIsEmpty({})).toBe(true);
	});

	it('any of the three fields is a match', () => {
		expect(candidateIsEmpty(match)).toBe(false);
		expect(candidateIsEmpty({ ...none, publisher: 'Del Rey' })).toBe(false);
		expect(candidateIsEmpty({ ...none, date_published: '2017' })).toBe(false);
		expect(candidateIsEmpty({ ...none, isbn: ['1'] })).toBe(false);
	});
});

describe('searchStatusLabel', () => {
	it('covers every match / no-match combination', () => {
		expect(searchStatusLabel({ ol: match, gb: match })).toBe(
			'Open Library: match. Google Books: match.',
		);
		expect(searchStatusLabel({ ol: match, gb: none })).toBe(
			'Open Library: match. Google Books: no match.',
		);
		expect(searchStatusLabel({ ol: none, gb: match })).toBe(
			'Open Library: no match. Google Books: match.',
		);
		expect(searchStatusLabel({ ol: none, gb: none })).toBe(
			'Open Library: no match. Google Books: no match.',
		);
	});

	it('is empty before any search', () => {
		expect(searchStatusLabel(null)).toBe('');
	});
});

describe('prefillLabel', () => {
	it('names the source', () => {
		expect(prefillLabel('Open Library')).toBe('Prefill from Open Library');
		expect(prefillLabel('Google Books')).not.toBe(prefillLabel('Open Library'));
	});
});

describe('books-table filter status wiring', () => {
	const table = read('app/admin/books/_components/books-table.tsx');
	const toolbar = between(table, 'aria-label="Filter catalog"', '{selectedCount > 0');

	it('the toolbar slice is found', () => {
		expect(toolbar.length).toBeGreaterThan(0);
	});

	// <output> carries the implicit status role (Biome's useSemanticElements wants it over role="status").
	it('the count is a status region whose spoken text comes from filterStatusLabel', () => {
		expect(toolbar).toMatch(
			/<output\s+aria-live="polite"\s+className="text-muted-foreground text-sm tabular-nums"/,
		);
		expect(toolbar).toMatch(/<\/output>/);
		expect(toolbar).toMatch(
			/filterStatusLabel\(\s*table\.getFilteredRowModel\(\)\.rows\.length,\s*data\.length,\s*activeLabel,?\s*\)/,
		);
		expect(toolbar).toMatch(/className="sr-only"/);
	});

	it('keeps the visible count text unchanged and hidden from the spoken name', () => {
		expect(toolbar).toMatch(/<span aria-hidden="true">/);
		expect(toolbar).toContain('{activeLabel ? ` · ${activeLabel}` : ` of ${data.length}`}');
	});
});

describe('new-book search wiring', () => {
	const form = read('app/admin/books/new/_components/new-book-form.tsx');
	const candidate = between(form, 'function Candidate(', '\n}\n');

	it('the Candidate slice is found', () => {
		expect(candidate.length).toBeGreaterThan(0);
	});

	it('an always-mounted sr-only status region announces searchStatusLabel(results)', () => {
		expect(form).toMatch(
			/<output\s+aria-live="polite"\s+className="sr-only">\s*\{searchStatusLabel\(\s*results\s*\)\}\s*<\/output>/,
		);
		// Mounted outside the `{results && …}` branch so the first result is announced.
		const status = form.indexOf('{searchStatusLabel(');
		const branch = form.indexOf('{results && (');
		expect(status).toBeGreaterThan(-1);
		expect(branch).toBeGreaterThan(status);
	});

	it('each Prefill button is named for its source', () => {
		expect(candidate).toMatch(/aria-label=\{prefillLabel\(\s*label\s*\)\}/);
	});

	it('no-match uses the shared candidateIsEmpty helper', () => {
		expect(candidate).toMatch(/const empty = candidateIsEmpty\(\s*candidate\s*\)/);
	});

	it('candidate details are dt/dd pairs inside the <dl>', () => {
		const dl = between(candidate, '<dl', '</dl>');
		expect(dl.length).toBeGreaterThan(0);
		for (const term of ['ISBNs', 'Publisher', 'Published', 'Language']) {
			expect(dl, term).toMatch(new RegExp(`<div>\\s*<dt className="inline">${term}:</dt>`));
		}
		expect(dl.match(/<dd className="inline">/g)?.length).toBe(4);
		expect(dl).not.toMatch(/<div>[A-Z][a-z]+:/);
	});
});
