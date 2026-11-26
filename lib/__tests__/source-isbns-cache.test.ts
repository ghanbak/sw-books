import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CACHE_SCHEMA_VERSION,
	type CacheEntry,
	filterCacheEntries,
} from '../../scripts/lib/isbn-cache';

// scripts/source-isbns.ts runs main() on import, so the cache read path is
// tested through the extracted helper plus source checks on the script.
const SCRIPTS = resolve(__dirname, '..', '..', 'scripts');
const SCRIPT = readFileSync(resolve(SCRIPTS, 'source-isbns.ts'), 'utf8');
const CACHE_LIB = readFileSync(resolve(SCRIPTS, 'lib', 'isbn-cache.ts'), 'utf8');

const GOOD = '9780345384003';
const BAD_CHECK = '9780345384004';

function entry(isbns: string[], schema: number = CACHE_SCHEMA_VERSION): Partial<CacheEntry> {
	return {
		schema_version: schema as typeof CACHE_SCHEMA_VERSION,
		fetched_at: '2026-11-01T00:00:00.000Z',
		current_isbn: GOOD,
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

describe('filterCacheEntries', () => {
	it('does not serve a cached entry holding a bad-check ISBN', () => {
		const r = filterCacheEntries({ bad: entry([GOOD, BAD_CHECK]) });
		expect(r.entries.bad).toBeUndefined();
		expect(r.invalidIsbn).toBe(1);
	});

	it('does not serve a cached entry holding a non-ISBN-13 edition id', () => {
		const r = filterCacheEntries({ ten: entry(['0345384008']) });
		expect(r.entries.ten).toBeUndefined();
	});

	it('serves a current-schema entry whose ISBNs all pass the checksum', () => {
		const r = filterCacheEntries({ ok: entry([GOOD]), empty: entry([]) });
		expect(Object.keys(r.entries).sort()).toEqual(['empty', 'ok']);
		expect(r.stale).toBe(0);
		expect(r.invalidIsbn).toBe(0);
	});

	it('drops pre-checksum (v9) entries, which may hold ISBNs converted from bad ISBN-10s', () => {
		const r = filterCacheEntries({ old: entry([GOOD], 9) });
		expect(r.entries.old).toBeUndefined();
		expect(r.stale).toBe(1);
	});

	it('drops malformed entries', () => {
		const r = filterCacheEntries({
			nul: null,
			noEditions: { schema_version: CACHE_SCHEMA_VERSION },
		});
		expect(r.entries).toEqual({});
		expect(r.stale).toBe(2);
	});
});

describe('scripts/source-isbns.ts cache wiring', () => {
	it('bumps the schema past the pre-checksum v9', () => {
		expect(CACHE_SCHEMA_VERSION).toBeGreaterThan(9);
	});

	it('header comment names the current schema version', () => {
		const m = SCRIPT.match(/schema_version (\d+)/);
		expect(Number(m?.[1])).toBe(CACHE_SCHEMA_VERSION);
	});

	it('loadCache reads through filterCacheEntries and keeps no private schema constant', () => {
		expect(SCRIPT).toMatch(
			/import\s*\{[^}]*\bfilterCacheEntries\b[^}]*\}\s*from\s*'\.\/lib\/isbn-cache'/,
		);
		expect(SCRIPT).toMatch(/\bfilterCacheEntries\(\s*parsed\.entries/);
		expect(SCRIPT).not.toMatch(/const\s+CACHE_SCHEMA_VERSION\s*=/);
		expect(CACHE_LIB).toMatch(/\bisValidIsbn13\b/);
	});
});
