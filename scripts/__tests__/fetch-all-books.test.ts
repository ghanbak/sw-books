import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOKS_PAGE_SIZE, backupRefusal, countBooks, fetchAllBooks } from '../_supabase';

// #363: PostgREST caps an unranged response at max_rows (1000, supabase/config.toml and the
// hosted default). The fake below enforces that cap, so an unpaged read sees 1000 rows.
const MAX_ROWS = 1000;

type Row = { id: string; slug: string; title: string };
type Err = { message: string };

function makeRows(n: number): Row[] {
	return Array.from({ length: n }, (_, i) => {
		const k = String(i).padStart(5, '0');
		return { id: `id-${k}`, slug: `slug-${k}`, title: `Title ${k}` };
	});
}

function fakeClient(rows: Row[], opts: { failAtFrom?: number; countError?: Err } = {}) {
	const calls = {
		ranges: [] as Array<[number, number]>,
		orders: [] as string[],
		nots: [] as string[],
		selects: [] as string[],
		unranged: 0,
	};
	const builder = {
		not(col: string, _op: string, _v: unknown) {
			calls.nots.push(col);
			return builder;
		},
		order(col: string) {
			calls.orders.push(col);
			return builder;
		},
		range(from: number, to: number) {
			calls.ranges.push([from, to]);
			const size = Math.min(to - from + 1, MAX_ROWS);
			if (opts.failAtFrom !== undefined && from >= opts.failAtFrom) {
				return Promise.resolve({ data: null, error: { message: 'upstream timeout' }, status: 0 });
			}
			return Promise.resolve({ data: rows.slice(from, from + size), error: null, status: 200 });
		},
		// Awaiting the builder without .range() — PostgREST still caps at max_rows.
		// biome-ignore lint/suspicious/noThenProperty: models the thenable postgrest-js builder
		then(resolveFn: (v: unknown) => unknown) {
			calls.unranged += 1;
			return Promise.resolve({ data: rows.slice(0, MAX_ROWS), error: null }).then(resolveFn);
		},
	};
	const client = {
		from(table: string) {
			if (table !== 'books') throw new Error(`unexpected table ${table}`);
			return {
				select(cols: string, sel?: { count?: string; head?: boolean }) {
					if (sel?.head) {
						expect(sel.count).toBe('exact');
						return Promise.resolve(
							opts.countError
								? { data: null, count: null, error: opts.countError }
								: { data: null, count: rows.length, error: null },
						);
					}
					calls.selects.push(cols);
					return builder;
				},
			};
		},
	};
	return { client: client as never, calls };
}

describe('fetchAllBooks (paged books read, #363)', () => {
	it('uses a 1000-row page, matching PostgREST max_rows', () => {
		expect(BOOKS_PAGE_SIZE).toBe(1000);
	});

	it('collects all 2,345 rows in 3 ranged calls, in order', async () => {
		const rows = makeRows(2345);
		const { client, calls } = fakeClient(rows);
		const got = await fetchAllBooks<Row>(client);
		expect(got).toHaveLength(2345);
		expect(got.map((r) => r.slug)).toEqual(rows.map((r) => r.slug));
		expect(calls.ranges).toEqual([
			[0, 999],
			[1000, 1999],
			[2000, 2999],
		]);
		expect(calls.unranged).toBe(0);
	});

	it('issues one more call when the total is an exact multiple of the page', async () => {
		const { client, calls } = fakeClient(makeRows(2000));
		const got = await fetchAllBooks<Row>(client);
		expect(got).toHaveLength(2000);
		expect(calls.ranges).toHaveLength(3);
	});

	it('returns [] for an empty table after one call', async () => {
		const { client, calls } = fakeClient([]);
		expect(await fetchAllBooks<Row>(client)).toEqual([]);
		expect(calls.ranges).toHaveLength(1);
	});

	it('rejects when a page errors mid-pagination (no partial result)', async () => {
		const { client, calls } = fakeClient(makeRows(2345), { failAtFrom: 1000 });
		await expect(fetchAllBooks<Row>(client)).rejects.toThrow(/upstream timeout/);
		expect(calls.ranges).toEqual([
			[0, 999],
			[1000, 1999],
		]);
	});

	it('keeps the caller columns, order, and not-null filters; slug breaks ties', async () => {
		const { client, calls } = fakeClient(makeRows(3));
		await fetchAllBooks<Row>(client, {
			columns: 'slug, title',
			orderBy: ['title'],
			notNull: ['primary_isbn'],
		});
		expect(calls.selects).toEqual(['slug, title']);
		expect(calls.nots).toEqual(['primary_isbn']);
		expect(calls.orders).toEqual(['title', 'slug']);
	});

	it('defaults to select * ordered by slug', async () => {
		const { client, calls } = fakeClient(makeRows(3));
		await fetchAllBooks<Row>(client);
		expect(calls.selects).toEqual(['*']);
		expect(calls.orders).toEqual(['slug']);
	});
});

describe('backup completeness guard (#363)', () => {
	it('countBooks reads the exact count, not a capped row list', async () => {
		const { client } = fakeClient(makeRows(1500));
		expect(await countBooks(client)).toBe(1500);
	});

	it('countBooks rejects on a count error', async () => {
		const { client } = fakeClient(makeRows(5), { countError: { message: 'permission denied' } });
		await expect(countBooks(client)).rejects.toThrow(/permission denied/);
	});

	it('refuses a truncated backup (1000 rows vs exact count 1500)', async () => {
		const { client } = fakeClient(makeRows(1500));
		const liveCount = await countBooks(client);
		const msg = backupRefusal({ ageMs: 5_000, rows: 1000, liveCount, maxAgeMs: 600_000 });
		expect(msg).toMatch(/1000 rows vs 1500 live/);
	});

	it('refuses a stale or unreadable backup', () => {
		expect(backupRefusal({ ageMs: 700_000, rows: 10, liveCount: 10, maxAgeMs: 600_000 })).toMatch(
			/Refusing/,
		);
		expect(
			backupRefusal({
				ageMs: Number.POSITIVE_INFINITY,
				rows: -1,
				liveCount: 10,
				maxAgeMs: 600_000,
			}),
		).toMatch(/Refusing/);
	});

	it('accepts a fresh, complete backup', () => {
		expect(backupRefusal({ ageMs: 5_000, rows: 1500, liveCount: 1500, maxAgeMs: 600_000 })).toBe(
			null,
		);
	});
});

// Wiring: every full-table books read in scripts/ goes through the pager.
const SCRIPTS = resolve(__dirname, '..');
const PAGED = [
	'export-db-to-csv.ts',
	'apply-catalog-changeset.ts',
	'build-catalog-changeset.ts',
	'build-catalog-cleanup.ts',
	'classify-discovery.ts',
	'enrich-wookieepedia.ts',
	'gen-manual-review-doc.ts',
	'verify-primary-isbns.ts',
];

describe.each(PAGED)('scripts/%s books reads', (file) => {
	const src = readFileSync(resolve(SCRIPTS, file), 'utf-8');

	it('calls fetchAllBooks', () => {
		expect(src).toMatch(/\bfetchAllBooks\s*(<[^>]*>)?\s*\(/);
	});

	it('has no unbounded from("books").select(...) left', () => {
		// Every remaining books select must be a single-row or filtered lookup on the same chain.
		const chains = src.match(/\.from\(\s*['"]books['"]\s*\)\s*\.select\([^;]*?;/gs) ?? [];
		const unbounded = chains.filter(
			(c) => !/\.(eq|maybeSingle|single|range)\s*\(|head:\s*true/.test(c),
		);
		expect(unbounded).toEqual([]);
	});
});

describe('apply-catalog-changeset backup guard wiring', () => {
	const src = readFileSync(resolve(SCRIPTS, 'apply-catalog-changeset.ts'), 'utf-8');

	it('compares the backup against countBooks, not live.length', () => {
		expect(src).toMatch(/countBooks\s*\(\s*supabase\s*\)/);
		expect(src).toMatch(/backupRefusal\s*\(/);
		expect(src).not.toMatch(/backupOrRefuse\s*\(\s*live\.length\s*\)/);
	});
});
