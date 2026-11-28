import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LookupBook, pickFillEmptyCover } from '../sources/lookup-selection';
import type { LookupResult } from '../sources/types';

// #353: bulk Fill empty wrote OL's ISBN cover URL unchecked. lookup.ts builds
// it even when the edition has no cover, and `?default=false` makes it 404, so
// GB's real cover was never considered and the book dropped off "missing cover".

const OL = 'https://covers.openlibrary.org/b/isbn/9780000000002-L.jpg?default=false';
const GB = 'https://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1';

const cand = (ol: LookupResult['ol'], gb: LookupResult['gb']): LookupResult => ({
	ol,
	gb,
	fetchedAt: '2026-11-21T00:00:00Z',
});

const passing = (ok: string[]) => {
	const checked: string[] = [];
	const fn = async (url: string) => {
		checked.push(url);
		return ok.includes(url);
	};
	return { fn, checked };
};

describe('pickFillEmptyCover (#353)', () => {
	it('falls back to the GB cover when the OL URL fails', async () => {
		const h = passing([GB]);
		expect(await pickFillEmptyCover(cand({ cover_image: OL }, { cover_image: GB }), h.fn)).toBe(GB);
		expect(h.checked).toEqual([OL, GB]);
	});

	it('returns null when both covers fail', async () => {
		const h = passing([]);
		expect(
			await pickFillEmptyCover(cand({ cover_image: OL }, { cover_image: GB }), h.fn),
		).toBeNull();
		expect(h.checked).toEqual([OL, GB]);
	});

	it('keeps OL when it passes, without checking GB', async () => {
		const h = passing([OL, GB]);
		expect(await pickFillEmptyCover(cand({ cover_image: OL }, { cover_image: GB }), h.fn)).toBe(OL);
		expect(h.checked).toEqual([OL]);
	});

	it('checks GB alone when OL has no cover, and skips blank values', async () => {
		const h = passing([GB]);
		expect(await pickFillEmptyCover(cand({ cover_image: '  ' }, { cover_image: GB }), h.fn)).toBe(
			GB,
		);
		expect(h.checked).toEqual([GB]);
		expect(await pickFillEmptyCover(cand({}, {}), h.fn)).toBeNull();
		expect(await pickFillEmptyCover(null, h.fn)).toBeNull();
	});
});

// Drives the real admin `fillEmpty` with the recording fake Supabase client from
// fill-empty.test.ts; only I/O modules are mocked. The head check passes `db.ok`.
type Call = { op: string; args: unknown[] };
const db = vi.hoisted(() => ({
	calls: [] as Array<Array<{ op: string; args: unknown[] }>>,
	replies: [] as Array<{ data: unknown; error: unknown }>,
	look: null as unknown,
	ok: [] as string[],
	checked: [] as string[],
}));

function query(): Record<string, (...args: unknown[]) => unknown> {
	const calls: Call[] = [];
	db.calls.push(calls);
	const reply = () => Promise.resolve(db.replies.shift() ?? { data: null, error: null });
	const q: Record<string, (...args: unknown[]) => unknown> = {};
	for (const op of ['select', 'update', 'eq', 'is']) {
		q[op] = (...args: unknown[]) => {
			calls.push({ op, args });
			return q;
		};
	}
	q.single = reply;
	q.maybeSingle = reply;
	return q;
}

vi.mock('../../admin/lib/auth', () => ({ getAdmin: async () => ({ id: 'admin' }) }));
vi.mock('../../admin/lib/supabase-admin', () => ({
	getDbTarget: async () => 'prod',
	getSupabaseAdmin: async () => ({ from: () => query() }),
}));
vi.mock('next/cache', () => ({ revalidateTag: () => {} }));
vi.mock('../../admin/node_modules/next/cache.js', () => ({ revalidateTag: () => {} }));
vi.mock('../sources/covers', () => ({
	headCheckCover: async (url: string) => {
		db.checked.push(url);
		return db.ok.includes(url);
	},
}));
vi.mock('../sources/google-books', () => ({ fetchVolumes: async () => null }));
vi.mock('../sources/open-library', () => ({ coverByIsbnUrl: (i: string) => i }));
vi.mock('../sources/lookup', () => ({ lookupCandidatesFor: async () => db.look }));

const bulkPath = resolve(__dirname, '../../admin/app/_actions/bulk.ts');
type Bulk = {
	fillEmpty: (
		slug: string,
		expectedTarget: string,
	) => Promise<{ slug: string; status: string; fields?: string[] }>;
};
const load = async (): Promise<Bulk> => (await import(/* @vite-ignore */ bulkPath)) as Bulk;

const book: LookupBook = {
	cover_image: null,
	publisher: null,
	date_published: '2020-01-01',
	language: 'en',
	synopsis: 's',
	format: ['Hardcover'],
	isbn: ['9780000000002'],
	primary_isbn: '9780000000002',
};

async function run(ok: string[]) {
	db.ok = ok;
	db.look = cand({ cover_image: OL, publisher: 'Del Rey' }, { cover_image: GB });
	const row = { id: 'b1', updated_at: '2026-11-01T00:00:00Z', ...book };
	db.replies.push({ data: row, error: null }, { data: { ...row }, error: null });
	const { fillEmpty } = await load();
	const res = await fillEmpty('some-book', 'prod');
	const update = db.calls.flat().find((x) => x.op === 'update');
	return { res, written: update?.args[0] };
}

beforeEach(() => {
	db.calls.length = 0;
	db.replies.length = 0;
	db.checked.length = 0;
});

describe('bulk fillEmpty cover head check (#353)', () => {
	it('writes the GB cover when the OL URL fails', async () => {
		const { res, written } = await run([GB]);
		expect(res.status).toBe('updated');
		expect(written).toEqual({ cover_image: GB, publisher: 'Del Rey' });
	});

	it('drops cover_image when both fail, still filling other fields', async () => {
		const { res, written } = await run([]);
		expect(res.status).toBe('updated');
		expect(res.fields).toEqual(['publisher']);
		expect(written).toEqual({ publisher: 'Del Rey' });
	});

	it('keeps the OL cover when it passes', async () => {
		const { written } = await run([OL]);
		expect(written).toEqual({ cover_image: OL, publisher: 'Del Rey' });
		expect(db.checked).toEqual([OL]);
	});
});

const read = (p: string) => {
	const abs = resolve(__dirname, '../..', p);
	return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
};

describe('Fill empty cover wiring (#353)', () => {
	it('bulk.ts head-checks the cover via pickFillEmptyCover', () => {
		const src = read('admin/app/_actions/bulk.ts');
		expect(src).toMatch(/pickFillEmptyCover\(\s*candidates,\s*headCheckCover\s*\)/);
	});
});
