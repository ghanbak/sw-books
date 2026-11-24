// The pin editor's Wookieepedia search clears the previous candidates before each search
// (issue 390): a failed search leaves no stale Pin buttons, and a repeat re-announces.
// The helper's behaviour is covered in new-book-search-reset.test.ts; this checks the wiring.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const path = resolve(__dirname, '../../admin/app/admin/books/[slug]/_components/pin-editor.tsx');
const source = existsSync(path) ? readFileSync(path, 'utf-8') : '';

describe('pin editor search wiring', () => {
	const start = source.indexOf('function search(');
	const end = source.indexOf('function save(');
	const search = start >= 0 && end > start ? source.slice(start, end) : '';

	it('the search() slice is found', () => {
		expect(search.length).toBeGreaterThan(0);
	});

	it('imports runResettingSearch', () => {
		expect(source).toMatch(
			/import\s*\{\s*runResettingSearch\s*\}\s*from\s*'@\/lib\/resetting-search'/,
		);
	});

	it('search() goes through runResettingSearch with setResults and startSearch', () => {
		expect(search).toMatch(/runResettingSearch\(\s*setResults,\s*startSearch,/);
		expect(search).toMatch(/searchPinCandidates\(\s*slug,\s*query\s*\)/);
	});

	it('search() does not start its own transition or set results itself', () => {
		expect(search).not.toMatch(/if\s*\(\s*res\.ok\s*\)\s*setResults\(/);
		expect(search).not.toMatch(/startSearch\(\s*async/);
		expect(search).not.toMatch(/setResults\(\s*res\.data\s*\)/);
	});
});
