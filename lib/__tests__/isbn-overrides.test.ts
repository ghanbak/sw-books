/**
 * Data invariants over the committed ISBN override files, resolved exactly as
 * scripts/seed.ts does (manual overrides win per slug; no override → the CSV
 * ISBN). Regression for #78: 9781368057943 sat on both queens-peril (pipeline
 * override) and queens-shadow (manual override), so a scan could return either.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveIsbnList } from '../catalog';
import { parseCsv } from '../csv/read';
import { isValidIsbn13 } from '../isbn';

const DATA = resolve(__dirname, '..', '..', 'data');
const load = <T>(file: string): T => JSON.parse(readFileSync(resolve(DATA, file), 'utf-8')) as T;

const isbnOverrides = {
	...load<Record<string, string[]>>('isbn-overrides.json'),
	...load<Record<string, string[]>>('isbn-manual-overrides.json'),
};
const primaryOverrides = {
	...load<Record<string, string>>('primary-isbn.json'),
	...load<Record<string, string>>('primary-isbn-manual-overrides.json'),
};
const records = parseCsv(readFileSync(resolve(DATA, 'books.csv'), 'utf-8'));

/** Every ISBN → the slugs holding it (isbn[] or primary_isbn), per the seed's resolution. */
function holders(): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const rec of records) {
		const slug = rec.slug.trim();
		const list = resolveIsbnList(rec, isbnOverrides);
		const primary = primaryOverrides[slug] ?? list[0];
		for (const i of new Set([...list, ...(primary ? [primary] : [])])) {
			out.set(i, [...(out.get(i) ?? []), slug]);
		}
	}
	return out;
}

/** ISBN → slugs, across the override files alone (no CSV fallback). */
function overrideHolders(): Map<string, string[]> {
	const out = new Map<string, string[]>();
	const add = (i: string, slug: string) => {
		const cur = out.get(i) ?? [];
		if (!cur.includes(slug)) out.set(i, [...cur, slug]);
	};
	for (const [slug, list] of Object.entries(isbnOverrides)) for (const i of list) add(i, slug);
	for (const [slug, i] of Object.entries(primaryOverrides)) add(i, slug);
	return out;
}

const invalid = (m: Map<string, string[]>) =>
	Object.fromEntries([...m].filter(([isbn]) => !isValidIsbn13(isbn)));

const shared = (m: Map<string, string[]>) =>
	Object.fromEntries([...m].filter(([, slugs]) => slugs.length > 1));

describe('ISBN override files', () => {
	it('map every ISBN to at most one book', () => {
		expect(shared(overrideHolders())).toEqual({});
	});

	it('resolve (as the seed does) to no ISBN shared by two books', () => {
		expect(shared(holders())).toEqual({});
	});

	it("keep 9781368057943 on Queen's Shadow only, each Queen's book on its own primary", () => {
		expect(holders().get('9781368057943')).toEqual(['queens-shadow']);
		const primaries = ['queens-peril', 'queens-shadow', 'queens-hope'].map(
			(s) => primaryOverrides[s],
		);
		expect(new Set(primaries).size).toBe(3);
		for (const slug of ['queens-peril', 'queens-shadow', 'queens-hope']) {
			expect(isbnOverrides[slug]).toContain(primaryOverrides[slug]);
		}
	});

	// #86: normalizeIsbn rejects a bad ISBN-13 check digit, so a scan can never
	// match it. Runs over the seed resolution (books.csv + overrides), not the
	// prod snapshot in data/catalog-backup.csv (catalog:health covers that).
	it('hold only ISBN-13s with a valid check digit', () => {
		expect(invalid(overrideHolders())).toEqual({});
	});

	it('resolve (as the seed does) to only ISBN-13s with a valid check digit', () => {
		expect(invalid(holders())).toEqual({});
	});
});
