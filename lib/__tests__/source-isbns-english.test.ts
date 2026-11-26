import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CACHE_SCHEMA_VERSION,
	type CacheEntry,
	filterCacheEntries,
} from '../../scripts/lib/isbn-cache';
import { isEnglishIsbn } from '../isbn';

// scripts/source-isbns.ts runs main() on import, so its English gate is tested
// through the shared lib/isbn predicate plus a source check on the script.
const SCRIPTS = resolve(__dirname, '..', '..', 'scripts');
const SCRIPT = readFileSync(resolve(SCRIPTS, 'source-isbns.ts'), 'utf8');

const ENGLISH = '9780300000016';
const FRANCE = '9791000000015';
const KOREA = '9791100000014';

function entry(isbns: string[]): Partial<CacheEntry> {
	return {
		schema_version: CACHE_SCHEMA_VERSION,
		fetched_at: '2026-11-01T00:00:00.000Z',
		current_isbn: ENGLISH,
		ol_work_id: null,
		editions: isbns.map((isbn) => ({
			isbn,
			format: null,
			publish_date: null,
			cover_url: null,
			source: 'ol' as const,
		})),
		source: 'ol',
		csv_isbn_rejected: false,
		csv_isbn_ol_title: null,
	};
}

describe('isEnglishIsbn (source-isbns English gate)', () => {
	it.each([
		[KOREA, 'Korea (979-11)'],
		[FRANCE, 'France (979-10)'],
		['9791220000017', 'Italy (979-12)'],
		['9790000000001', 'ISMN (979-0)'],
		['9798886000016', 'US 979-8'],
	])('rejects %s (%s)', (isbn) => {
		expect(isEnglishIsbn(isbn)).toBe(false);
	});

	it.each([ENGLISH, '9781593070007'])('accepts 978-0/978-1 %s', (isbn) => {
		expect(isEnglishIsbn(isbn)).toBe(true);
	});
});

describe('filterCacheEntries English gate', () => {
	it('does not serve a cached entry holding a 979-1x edition', () => {
		const r = filterCacheEntries({ fr: entry([ENGLISH, FRANCE]), kr: entry([KOREA]) });
		expect(r.entries.fr).toBeUndefined();
		expect(r.entries.kr).toBeUndefined();
		expect(r.nonEnglishIsbn).toBe(2);
		expect(r.invalidIsbn).toBe(0);
	});

	it('still serves an all-English entry', () => {
		const r = filterCacheEntries({ ok: entry([ENGLISH, '9781593070007']) });
		expect(Object.keys(r.entries)).toEqual(['ok']);
		expect(r.nonEnglishIsbn).toBe(0);
	});
});

describe('scripts/source-isbns.ts English gate wiring', () => {
	it('imports isEnglishIsbn from lib/isbn', () => {
		expect(SCRIPT).toMatch(/import\s*\{[^}]*\bisEnglishIsbn\b[^}]*\}\s*from\s*'\.\.\/lib\/isbn'/);
	});

	it('no longer defines or calls a private isEnglishLanguageIsbn', () => {
		expect(SCRIPT).not.toMatch(/\bisEnglishLanguageIsbn\b/);
	});

	it('gates OL and Google Books ISBNs through isEnglishIsbn', () => {
		expect(SCRIPT).toMatch(/normalized\.some\(\s*isEnglishIsbn\s*\)/);
		expect(SCRIPT).toMatch(/if\s*\(\s*n\s*&&\s*isEnglishIsbn\(\s*n\s*\)\s*\)\s*isbns\.add/);
		expect(SCRIPT).toMatch(/!\s*isEnglishIsbn\(\s*n\s*\)\s*\)\s*continue/);
	});

	it('loadCache reports non-English drops', () => {
		expect(SCRIPT).toMatch(/\bnonEnglishIsbn\b/);
	});
});
