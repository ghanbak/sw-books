import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	type HealthRow,
	ISBN_PROBLEM_LABEL,
	checkInvalidIsbns,
	scannerIsbnProblems,
} from '../catalog-health';

// #477: admin Validate ISBNs must flag what catalog:health flags (only a bare,
// valid ISBN-13 is scanner-matchable), across isbn[] and primary_isbn.
const row = (
	slug: string,
	isbn: string[] | null,
	primary_isbn: string | null = null,
): HealthRow => ({
	slug,
	isbn,
	primary_isbn,
});

const FIXTURES: HealthRow[] = [
	row('isbn10', ['0345391802']),
	row('hyphenated', ['978-0-345-39180-3']),
	row('bad-check', ['9780345391804']),
	row('bad-check-10', ['0345391803']),
	row('valid', ['9780345391803'], '9780345391803'),
	row('bad-primary-only', ['9780345391803'], '0345391802'),
	row('empty', [], null),
	row('null-isbns', null, null),
	row('blank-primary', ['9780345391803'], '  '),
	row('mixed', ['9780345391803', '0345391802', 'abc']),
];

describe('scannerIsbnProblems', () => {
	it('flags an ISBN-10', () => {
		expect(scannerIsbnProblems(row('a', ['0345391802']))).toEqual([
			{ isbn: '0345391802', role: 'isbn[]', verdict: 'valid-10' },
		]);
	});

	it('flags a hyphenated ISBN-13 as malformed', () => {
		expect(scannerIsbnProblems(row('a', ['978-0-345-39180-3']))).toEqual([
			{ isbn: '978-0-345-39180-3', role: 'isbn[]', verdict: 'malformed' },
		]);
	});

	it('flags a bad check digit', () => {
		expect(scannerIsbnProblems(row('a', ['9780345391804']))).toEqual([
			{ isbn: '9780345391804', role: 'isbn[]', verdict: 'bad-check-digit' },
		]);
	});

	it('passes a valid bare ISBN-13', () => {
		expect(scannerIsbnProblems(row('a', ['9780345391803'], '9780345391803'))).toEqual([]);
	});

	it('checks primary_isbn too', () => {
		expect(scannerIsbnProblems(row('a', ['9780345391803'], '0345391802'))).toEqual([
			{ isbn: '0345391802', role: 'primary_isbn', verdict: 'valid-10' },
		]);
	});

	it('labels each reason', () => {
		expect(ISBN_PROBLEM_LABEL).toEqual({
			'valid-10': 'ISBN-10',
			malformed: 'malformed',
			'bad-check-digit': 'bad check digit',
		});
	});

	it.each(FIXTURES)('matches checkInvalidIsbns for $slug', (r) => {
		expect(scannerIsbnProblems(r).length > 0).toBe(checkInvalidIsbns([r]).length > 0);
		expect(scannerIsbnProblems(r)).toHaveLength(checkInvalidIsbns([r]).length);
	});
});

describe('books-table Validate ISBNs wiring', () => {
	const path = resolve(__dirname, '../../admin/app/admin/books/_components/books-table.tsx');
	const src = existsSync(path) ? readFileSync(path, 'utf8') : '';
	const body = src.slice(src.indexOf('function validateIsbns'));
	const fn = body.slice(0, body.indexOf('\n\t}\n'));

	it('imports the shared helper from catalog-health', () => {
		expect(src).toMatch(
			/import\s*\{[^}]*\bscannerIsbnProblems\b[^}]*\}\s*from\s*'@app\/catalog-health'/,
		);
	});

	it('calls scannerIsbnProblems on each selected row', () => {
		expect(fn).toMatch(/scannerIsbnProblems\(\s*\w+\s*\)/);
	});

	it('names the reason via ISBN_PROBLEM_LABEL', () => {
		expect(fn).toMatch(/ISBN_PROBLEM_LABEL\[/);
	});

	it('no longer gates on isValidIsbn', () => {
		expect(fn).not.toMatch(/isValidIsbn\(/);
	});
});
