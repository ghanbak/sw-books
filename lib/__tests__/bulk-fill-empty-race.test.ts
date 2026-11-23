import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFLICT_ERROR } from '../stale-write';

// #384: bulk Fill empty ran the (slow) OL/GB lookup first and read `updated_at`
// only afterwards, so an edit landing during the lookup was overwritten with
// candidates for the old ISBN. Drives the real admin `fillEmpty` → `patchBook`
// → `guardedUpdate` path against a stateful fake Supabase client: one row, and
// an UPDATE only applies while its `updated_at` filter still matches.

type Row = Record<string, unknown>;
type Filter = { col: string; val: unknown };

const T0 = '2026-11-01T00:00:00Z';
const T1 = '2026-11-02T00:00:00Z';
const T2 = '2026-11-03T00:00:00Z';

const db = vi.hoisted(() => ({
	row: null as Record<string, unknown> | null,
	writes: [] as Array<{ patch: Record<string, unknown>; at: unknown }>,
	lookups: [] as Array<{ isbn: string | null; title: string; author: string }>,
	// Runs inside the lookup, i.e. while fillEmpty is waiting on OL/GB.
	duringLookup: null as (() => void) | null,
}));

function query() {
	let patch: Row | null = null;
	const filters: Filter[] = [];
	const matches = (r: Row) => filters.every((f) => r[f.col] === f.val);
	const reply = async () => {
		const r = db.row;
		if (!r || !matches(r)) return { data: null, error: null };
		if (patch) {
			db.writes.push({ patch, at: filters.find((f) => f.col === 'updated_at')?.val });
			Object.assign(r, patch, { updated_at: T2 });
		}
		return { data: { ...r }, error: null };
	};
	const q = {
		select: () => q,
		update: (p: Row) => {
			patch = p;
			return q;
		},
		eq: (col: string, val: unknown) => {
			filters.push({ col, val });
			return q;
		},
		is: (col: string, val: unknown) => {
			filters.push({ col, val });
			return q;
		},
		single: reply,
		maybeSingle: reply,
	};
	return q;
}

vi.mock('../../admin/lib/auth', () => ({ getAdmin: async () => ({ id: 'admin' }) }));
vi.mock('../../admin/lib/supabase-admin', () => ({
	getSupabaseAdmin: async () => ({ from: () => query() }),
}));
// Root has no `next`. Bare id covers CI (no admin deps); the path covers a
// local run where admin's install resolves it.
vi.mock('next/cache', () => ({ revalidateTag: () => {} }));
vi.mock('../../admin/node_modules/next/cache.js', () => ({ revalidateTag: () => {} }));
vi.mock('../sources/covers', () => ({ headCheckCover: async () => true }));
vi.mock('../sources/google-books', () => ({ fetchVolumes: async () => null }));
vi.mock('../sources/open-library', () => ({ coverByIsbnUrl: (i: string) => i }));
// The OL/GB network layer. Candidates depend on the ISBN the lookup was anchored on.
vi.mock('../sources/lookup', () => ({
	lookupCandidatesFor: async (input: { isbn: string | null; title: string; author: string }) => {
		db.lookups.push(input);
		db.duringLookup?.();
		return {
			ol: { publisher: `Publisher of ${input.isbn}` },
			gb: {},
			fetchedAt: '2026-11-23T00:00:00Z',
		};
	},
}));

// Non-literal path keeps the admin file out of the root typecheck.
const bulkPath = resolve(__dirname, '../../admin/app/_actions/bulk.ts');
type Bulk = {
	fillEmpty: (
		slug: string,
	) => Promise<{ slug: string; status: string; fields?: string[]; message?: string }>;
};
const load = async (): Promise<Bulk> => (await import(/* @vite-ignore */ bulkPath)) as Bulk;

beforeEach(() => {
	db.writes.length = 0;
	db.lookups.length = 0;
	db.duringLookup = null;
	db.row = {
		id: 'b1',
		slug: 'some-book',
		updated_at: T0,
		title: 'Some Book',
		author: ['A. Author', 'B. Author'],
		isbn: ['OLD'],
		primary_isbn: 'OLD',
		cover_image: 'https://example.com/c.jpg',
		publisher: null,
		date_published: '2020-01-01',
		language: 'en',
		synopsis: 's',
		format: ['Hardcover'],
	};
});

describe('bulk fillEmpty stale-write guard covers the lookup (#384)', () => {
	it('reports CONFLICT and writes nothing when the book is edited during the lookup', async () => {
		db.duringLookup = () => {
			Object.assign(db.row ?? {}, { isbn: ['NEW'], primary_isbn: 'NEW', updated_at: T1 });
		};
		const { fillEmpty } = await load();
		const res = await fillEmpty('some-book');

		expect(res).toEqual({ slug: 'some-book', status: 'error', message: CONFLICT_ERROR.message });
		expect(db.writes).toHaveLength(0);
		expect(db.row?.publisher).toBeNull();
		expect(db.row?.primary_isbn).toBe('NEW');
	});

	it('fills from a lookup anchored on the row it guards on when nothing changed', async () => {
		const { fillEmpty } = await load();
		const res = await fillEmpty('some-book');

		expect(res).toEqual({ slug: 'some-book', status: 'updated', fields: ['publisher'] });
		expect(db.lookups).toEqual([{ isbn: 'OLD', title: 'Some Book', author: 'A. Author' }]);
		expect(db.writes).toEqual([{ patch: { publisher: 'Publisher of OLD' }, at: T0 }]);
		expect(db.row?.publisher).toBe('Publisher of OLD');
	});

	it('probes isbn[0] when primary_isbn is null, and an empty author when there is none', async () => {
		Object.assign(db.row ?? {}, { primary_isbn: null, isbn: ['FIRST', 'SECOND'], author: [] });
		const { fillEmpty } = await load();
		await fillEmpty('some-book');

		expect(db.lookups).toEqual([{ isbn: 'FIRST', title: 'Some Book', author: '' }]);
	});
});
