import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCsv } from '../csv/read';

// #376: admin `books` reads went through PostgREST unranged, which caps a response
// at max_rows (1000) with no error. The fake below enforces that cap. Without an
// ORDER BY it also returns rows in a different arbitrary order per request (as
// Postgres may), so a paged read that skips the unique-key order loses rows.
const MAX_ROWS = 1000;
const N = 1500;

type Row = Record<string, unknown>;
type Err = { message: string; code?: string };

const db = vi.hoisted(() => ({
	tables: {} as Record<string, Record<string, unknown>[]>,
	/** Overrides the exact `books` count (head: true) when set. */
	booksCount: null as number | null,
	countError: null as { message: string } | null,
	likeError: null as { message: string } | null,
	orders: [] as Array<{ table: string; col: string }>,
	ranges: [] as Array<{ table: string; from: number; to: number }>,
	likes: [] as Array<{ col: string; pattern: string }>,
	unordered: 0,
	safeWrite: vi.fn(async (_rel: string, _contents: string): Promise<void> => {}),
	safeRead: vi.fn(async (_rel: string): Promise<string | null> => null),
}));

function query(table: string) {
	const st = {
		head: false,
		orders: [] as string[],
		eq: [] as Array<[string, unknown]>,
		like: null as { col: string; prefix: string } | null,
	};
	const filtered = () =>
		(db.tables[table] ?? []).filter(
			(r) =>
				st.eq.every(([c, v]) => r[c] === v) &&
				(!st.like || String(r[st.like.col]).startsWith(st.like.prefix)),
		);
	const ordered = (): Row[] => {
		const rows = filtered();
		if (st.orders.length) {
			return [...rows].sort((a, b) => {
				for (const c of st.orders) {
					const x = String(a[c]);
					const y = String(b[c]);
					if (x !== y) return x < y ? -1 : 1;
				}
				return 0;
			});
		}
		// No ORDER BY: a different arbitrary order on every request.
		db.unordered += 1;
		const k = (db.unordered * 389) % Math.max(rows.length, 1);
		return [...rows.slice(k), ...rows.slice(0, k)];
	};
	const q = {
		select(_cols: string, opts?: { count?: string; head?: boolean }) {
			if (opts?.head) {
				expect(opts.count).toBe('exact');
				st.head = true;
			}
			return q;
		},
		order(col: string) {
			db.orders.push({ table, col });
			st.orders.push(col);
			return q;
		},
		eq(col: string, v: unknown) {
			st.eq.push([col, v]);
			return q;
		},
		like(col: string, pattern: string) {
			db.likes.push({ col, pattern });
			st.like = { col, prefix: pattern.replace(/%$/, '') };
			return q;
		},
		maybeSingle() {
			return Promise.resolve({ data: filtered()[0] ?? null, error: null });
		},
		range(from: number, to: number) {
			db.ranges.push({ table, from, to });
			const size = Math.min(to - from + 1, MAX_ROWS);
			return Promise.resolve({ data: ordered().slice(from, from + size), error: null });
		},
		// Awaiting the builder without .range(): PostgREST still caps at max_rows.
		// biome-ignore lint/suspicious/noThenProperty: models the thenable postgrest-js builder
		then(done: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
			let res: unknown;
			if (st.head) {
				res = db.countError
					? { data: null, count: null, error: db.countError }
					: { data: null, count: db.booksCount ?? filtered().length, error: null };
			} else if (st.like && db.likeError) {
				res = { data: null, error: db.likeError };
			} else {
				res = { data: ordered().slice(0, MAX_ROWS), error: null };
			}
			return Promise.resolve(res).then(done, fail);
		},
	};
	return q;
}

vi.mock('server-only', () => ({}));
vi.mock('../../admin/node_modules/server-only/index.js', () => ({}));
vi.mock('../../admin/lib/auth', () => ({ getAdmin: async () => ({ id: 'admin' }) }));
vi.mock('../../admin/lib/admin-allowlist', () => ({ IS_HOSTED: false }));
// Nothing touches data/: both file ops are fakes.
vi.mock('../../admin/lib/safe-fs', () => ({
	DataDirUnavailableError: class extends Error {},
	safeRead: db.safeRead,
	safeWrite: db.safeWrite,
}));
vi.mock('../../admin/lib/supabase-admin', () => ({
	getDbTarget: async () => 'prod',
	getSupabaseAdmin: async () => ({ from: (t: string) => query(t) }),
}));
vi.mock('../wookieepedia/client', () => ({
	fetchPageInfo: async () => new Map(),
	searchPages: async () => [],
	fetchPagesByIds: async () => [],
}));
// Root has no `next`. Bare ids cover CI (no admin deps); the paths cover a
// local run where admin's install resolves them.
const nextCache = {
	unstable_cache: <T>(fn: T) => fn,
	revalidatePath: () => {},
	revalidateTag: () => {},
};
vi.mock('next/cache', () => nextCache);
vi.mock('../../admin/node_modules/next/cache.js', () => nextCache);

type Res<T = unknown> =
	| { ok: true; data: T }
	| { ok: false; error: { code: string; message: string } };
// Non-literal paths keep the admin files out of the root typecheck (their
// `@app/*` aliases only resolve under admin/tsconfig.json).
const ADMIN = resolve(__dirname, '../../admin');
const exportPath = resolve(ADMIN, 'app/_actions/export.ts');
const booksPath = resolve(ADMIN, 'app/_actions/books.ts');
const enrichmentPath = resolve(ADMIN, 'lib/enrichment.ts');
type ExportActions = {
	exportToCsv: () => Promise<Res<{ rows: number }>>;
	getDriftReport: () => Promise<Res<{ changedRows: unknown[]; summary: { rows: number } }>>;
};
type BooksActions = { createBook: (raw: unknown) => Promise<Res> };
type EnrichmentLib = {
	loadEnrichmentContext: (
		client: unknown,
	) => Promise<
		{ ok: true; data: { catalog: Row[]; existing: Row[] } } | { ok: false; message: string }
	>;
};
const loadExport = async () => (await import(/* @vite-ignore */ exportPath)) as ExportActions;
const loadBooks = async () => (await import(/* @vite-ignore */ booksPath)) as BooksActions;
const loadEnrichment = async () =>
	(await import(/* @vite-ignore */ enrichmentPath)) as EnrichmentLib;

const key = (i: number) => String(i).padStart(5, '0');

/** N books stored in a scrambled order (7 is coprime with 1500), so slug order is not storage order. */
function makeBooks(n: number): Row[] {
	return Array.from({ length: n }, (_, i) => {
		const k = key((i * 7) % n);
		return {
			id: `id-${k}`,
			slug: `book-${k}`,
			title: `Title ${Number(k) % 400}`,
			canon: 'Canon',
			type: 'Adult Novel',
			author: [],
			isbn: [],
			format: [],
		};
	});
}

const distinct = (rows: Row[], col: string) => new Set(rows.map((r) => r[col])).size;

beforeEach(() => {
	db.tables = { books: makeBooks(N) };
	db.booksCount = null;
	db.countError = null;
	db.likeError = null;
	db.orders.length = 0;
	db.ranges.length = 0;
	db.likes.length = 0;
	db.unordered = 0;
	db.safeWrite.mockReset();
	db.safeWrite.mockResolvedValue(undefined);
	db.safeRead.mockReset();
	db.safeRead.mockResolvedValue('slug,title\n');
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe('exportToCsv reads every row past the 1000-row cap (#376)', () => {
	it('writes all 1500 rows, each once, ordered by slug', async () => {
		const { exportToCsv } = await loadExport();
		const res = await exportToCsv().catch((e: unknown) => ({
			ok: false,
			error: { code: String(e), message: '' },
		}));
		expect(res).toMatchObject({ ok: true, data: { rows: N } });
		expect(db.safeWrite).toHaveBeenCalledTimes(1);
		const written = parseCsv(String(db.safeWrite.mock.calls[0]?.[1] ?? ''));
		expect(written).toHaveLength(N);
		expect(distinct(written, 'slug')).toBe(N);
		expect(db.orders.filter((o) => o.table === 'books').map((o) => o.col)).toContain('slug');
		expect(db.ranges.filter((r) => r.table === 'books').length).toBeGreaterThanOrEqual(2);
	});

	it('refuses to write when the exact count differs from the rows read', async () => {
		db.booksCount = N + 1;
		const { exportToCsv } = await loadExport();
		const res = await exportToCsv().catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		expect(res).toMatchObject({ ok: false, error: { code: 'INCOMPLETE' } });
		expect((res as Extract<Res, { ok: false }>).error.message).toMatch(/1500.*1501/);
		expect(db.safeWrite).not.toHaveBeenCalled();
	});

	it('refuses to write when the exact count fails', async () => {
		db.countError = { message: 'permission denied' };
		const { exportToCsv } = await loadExport();
		const res = await exportToCsv().catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		expect(res).toMatchObject({ ok: false });
		expect(db.safeWrite).not.toHaveBeenCalled();
	});
});

describe('getDriftReport sees every row past the 1000-row cap (#376)', () => {
	it('reports all 1500 DB rows against an empty backup', async () => {
		const { getDriftReport } = await loadExport();
		const res = await getDriftReport().catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		expect(res).toMatchObject({ ok: true });
		const data = (res as Extract<Res<{ changedRows: Row[] }>, { ok: true }>).data;
		expect(data.changedRows).toHaveLength(N);
		expect(distinct(data.changedRows, 'slug')).toBe(N);
	});
});

describe('loadEnrichmentContext reads every books and book_enrichment row (#376)', () => {
	it('returns 1500 catalog keys and 1500 persisted mappings', async () => {
		db.tables.book_enrichment = makeBooks(N).map((b, i) => ({
			book_id: b.id,
			source_pageid: 10_000 + i,
		}));
		const { loadEnrichmentContext } = await loadEnrichment();
		const res = await loadEnrichmentContext({ from: (t: string) => query(t) });
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.data.catalog).toHaveLength(N);
		expect(distinct(res.data.catalog, 'slug')).toBe(N);
		expect(res.data.existing).toHaveLength(N);
		expect(distinct(res.data.existing, 'book_id')).toBe(N);
		expect(db.orders).toContainEqual({ table: 'books', col: 'slug' });
		expect(db.orders).toContainEqual({ table: 'book_enrichment', col: 'book_id' });
	});
});

describe('createBook slug suggestion sees slugs past the 1000-row cap (#376)', () => {
	const input = { slug: 'dupe', title: 'Dupe', canon: 'Canon', type: 'Adult Novel' };

	beforeEach(() => {
		// `dupe` and `dupe-2` are taken; `dupe-2` sits past the first 1000 stored rows.
		const books = makeBooks(N);
		books.splice(0, 0, { id: 'id-dupe', slug: 'dupe', title: 'Dupe' });
		books.push({ id: 'id-dupe-2', slug: 'dupe-2', title: 'Dupe 2' });
		db.tables.books = books;
	});

	it('suggests a free slug, not one that is already taken', async () => {
		const { createBook } = await loadBooks();
		const res = await createBook(input).catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		expect(res).toMatchObject({ ok: false, error: { code: 'SLUG_TAKEN' } });
		const message = (res as Extract<Res, { ok: false }>).error.message;
		expect(message).toContain('"dupe-3"');
		expect(message).not.toContain('"dupe-2"');
		expect(db.likes).toContainEqual({ col: 'slug', pattern: 'dupe%' });
	});

	it('reports a failed suggestion read instead of guessing', async () => {
		db.likeError = { message: 'upstream timeout' };
		const { createBook } = await loadBooks();
		const res = await createBook(input).catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		expect(res).toMatchObject({ ok: false });
		expect((res as Extract<Res, { ok: false }>).error.code).not.toBe('SLUG_TAKEN');
	});
});

// Wiring: every multi-row books read in admin/app and admin/lib is single-row,
// a head count, filtered, ranged, or paged through fetchAllPages.
function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return sources(p);
		return /\.tsx?$/.test(name) ? [p] : [];
	});
}

const ADMIN_SOURCES = [...sources(join(ADMIN, 'app')), ...sources(join(ADMIN, 'lib'))];

describe('admin books reads are bounded or paged (#376)', () => {
	it('scans the admin sources', () => {
		expect(ADMIN_SOURCES.length).toBeGreaterThan(10);
	});

	it('has no unranged from("books").select(...) left', () => {
		const offenders: string[] = [];
		for (const file of ADMIN_SOURCES) {
			const src = readFileSync(file, 'utf-8');
			for (const m of src.matchAll(/\.from\(\s*['"]books['"]\s*\)\s*\.select\([^;]*?;/gs)) {
				const chain = m[0];
				const before = src.slice(Math.max(0, (m.index ?? 0) - 120), m.index);
				const paged = /fetchAllPages\s*\(\s*\(\s*\)\s*=>\s*[\w.\s]*$/.test(before);
				const bounded = /\.(eq|like|maybeSingle|single|range)\s*\(|head:\s*true/.test(chain);
				if (!paged && !bounded) offenders.push(`${relative(ADMIN, file)}: ${chain.slice(0, 80)}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('the catalog page pages books by title then slug', () => {
		const src = readFileSync(join(ADMIN, 'app/admin/books/page.tsx'), 'utf-8');
		expect(src).toMatch(/fetchAllPages\s*\(/);
		expect(src).toMatch(/\.order\(\s*'title'[^)]*\)\s*\.order\(\s*'slug'[^)]*\)/);
	});

	it('enrichment context pages both books and book_enrichment', () => {
		const src = readFileSync(join(ADMIN, 'lib/enrichment.ts'), 'utf-8');
		expect(src.match(/fetchAllPages\s*\(/g) ?? []).toHaveLength(2);
		expect(src).toMatch(/from\(\s*'book_enrichment'\s*\)[\s\S]*?\.order\(\s*'book_id'/);
	});
});
