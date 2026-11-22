import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, fetchAllCatalogBooks, fetchAllPages } from './fetch-all-pages';

// #364: PostgREST caps an unranged response at max_rows (1000, supabase/config.toml and the
// hosted default) with no error. The fake enforces that cap, so an unpaged read sees 1000 rows.
const MAX_ROWS = 1000;

type Row = { id: string; slug: string; timeline_order: number };

function makeRows(n: number): Row[] {
	return Array.from({ length: n }, (_, i) => {
		const k = String(i).padStart(5, '0');
		return { id: `id-${k}`, slug: `slug-${k}`, timeline_order: Math.floor(i / 3) };
	});
}

function fakeClient(rows: Row[], opts: { failAtFrom?: number } = {}) {
	const calls = {
		tables: [] as string[],
		selects: [] as string[],
		orders: [] as Array<[string, unknown]>,
		ranges: [] as Array<[number, number]>,
		unranged: 0,
	};
	const builder = {
		order(col: string, o?: unknown) {
			calls.orders.push([col, o]);
			return builder;
		},
		range(from: number, to: number) {
			calls.ranges.push([from, to]);
			if (opts.failAtFrom !== undefined && from >= opts.failAtFrom) {
				// supabase-js resolves failures as values; it does not reject.
				return Promise.resolve({
					data: null,
					error: { message: 'upstream timeout', code: '' },
					status: 0,
				});
			}
			const size = Math.min(to - from + 1, MAX_ROWS);
			return Promise.resolve({ data: rows.slice(from, from + size), error: null, status: 200 });
		},
		// Awaiting without .range(): PostgREST still caps at max_rows.
		// biome-ignore lint/suspicious/noThenProperty: models the thenable postgrest-js builder
		then(resolveFn: (v: unknown) => unknown) {
			calls.unranged += 1;
			return Promise.resolve({ data: rows.slice(0, MAX_ROWS), error: null }).then(resolveFn);
		},
	};
	const client = {
		from(table: string) {
			calls.tables.push(table);
			return {
				select(cols: string) {
					calls.selects.push(cols);
					return builder;
				},
			};
		},
	};
	return { client: client as never, calls };
}

describe('fetchAllCatalogBooks (paged catalog read, #364)', () => {
	it('uses a 1000-row page, matching PostgREST max_rows', () => {
		expect(PAGE_SIZE).toBe(1000);
	});

	it('collects 1000 + 1000 + 37 rows: 2037 books, one .range() per page', async () => {
		const rows = makeRows(2037);
		const { client, calls } = fakeClient(rows);
		const { data, error } = await fetchAllCatalogBooks(client);
		expect(error).toBeNull();
		expect(data).toHaveLength(2037);
		expect(data?.map((r) => r.slug)).toEqual(rows.map((r) => r.slug));
		expect(calls.ranges).toEqual([
			[0, 999],
			[1000, 1999],
			[2000, 2999],
		]);
		expect(calls.unranged).toBe(0);
	});

	it('orders by timeline_order then the unique slug, on every page', async () => {
		const { client, calls } = fakeClient(makeRows(2037));
		await fetchAllCatalogBooks(client);
		expect(calls.tables).toEqual(['books', 'books', 'books']);
		expect(calls.selects).toEqual(['*', '*', '*']);
		const perPage = [
			['timeline_order', { ascending: true }],
			['slug', { ascending: true }],
		];
		expect(calls.orders).toEqual([...perPage, ...perPage, ...perPage]);
	});

	it('an error on page 2 returns no partial catalog and surfaces that error unchanged', async () => {
		const { client, calls } = fakeClient(makeRows(2037), { failAtFrom: 1000 });
		const result = await fetchAllCatalogBooks(client);
		expect(result.data).toBeNull();
		expect(result.error?.message).toBe('upstream timeout');
		expect(calls.ranges).toEqual([
			[0, 999],
			[1000, 1999],
		]);
	});
});

describe('fetchAllPages', () => {
	it('issues one more call when the total is an exact multiple of the page', async () => {
		const { client, calls } = fakeClient(makeRows(2000));
		const { data } = await fetchAllCatalogBooks(client);
		expect(data).toHaveLength(2000);
		expect(calls.ranges).toHaveLength(3);
	});

	it('returns [] for an empty table after one call', async () => {
		const { client, calls } = fakeClient([]);
		expect(await fetchAllCatalogBooks(client)).toEqual({ data: [], error: null });
		expect(calls.ranges).toEqual([[0, 999]]);
	});

	it('treats a null page as empty and honours a custom page size', async () => {
		const pages = [
			{ data: [1, 2], error: null },
			{ data: null, error: null },
		];
		const ranges: Array<[number, number]> = [];
		const got = await fetchAllPages(
			() => ({
				range: (from: number, to: number) => {
					ranges.push([from, to]);
					return Promise.resolve(pages[ranges.length - 1]);
				},
			}),
			2,
		);
		expect(got).toEqual({ data: [1, 2], error: null });
		expect(ranges).toEqual([
			[0, 1],
			[2, 3],
		]);
	});
});

// Wiring: BooksProvider's fetchBooks must read through the pager, not an unranged select.
describe('BooksProvider wiring', () => {
	const src = readFileSync(resolve(__dirname, 'hooks.tsx'), 'utf8');
	const start = src.search(/const fetchBooks\s*=\s*useCallback\(/);
	const end = src.indexOf('}, []);', start);
	const body = start >= 0 && end > start ? src.slice(start, end) : '';

	it('finds the fetchBooks body', () => {
		expect(start).toBeGreaterThanOrEqual(0);
		expect(body).not.toBe('');
	});

	it('fetchBooks calls fetchAllCatalogBooks(supabase)', () => {
		expect(body).toMatch(/await\s+fetchAllCatalogBooks\(\s*supabase\s*\)/);
	});

	it('fetchBooks has no unranged books select left', () => {
		expect(body).not.toMatch(/\.from\(\s*['"]books['"]\s*\)/);
	});

	it('fetchBooks keeps the setError(message) path and never sets a partial catalog', () => {
		expect(body).toMatch(/if\s*\(\s*err\s*\)\s*\{\s*setError\(\s*err\.message\s*\);/);
	});
});
