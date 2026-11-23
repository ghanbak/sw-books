import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_ERROR } from '../action-errors';

// #377: bulk Re-fetch covers / Fill empty read only `data` from `.single()`, so
// a DB error (network drop, timeout, wrong target) showed as "not found". Drives
// the real admin actions with a fake Supabase client; only I/O is mocked.

const db = vi.hoisted(() => ({
	// One reply per awaited query, in call order.
	replies: [] as Array<{ data: unknown; error: unknown }>,
}));

function query(): Record<string, (...args: unknown[]) => unknown> {
	const reply = () => Promise.resolve(db.replies.shift() ?? { data: null, error: null });
	const q: Record<string, (...args: unknown[]) => unknown> = {};
	for (const op of ['select', 'update', 'eq', 'is']) q[op] = () => q;
	q.single = reply;
	q.maybeSingle = reply;
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
vi.mock('../sources/open-library', () => ({
	coverByIsbnUrl: (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
}));
// fillEmpty reads the row before the lookup; keep the lookup off the network.
vi.mock('../sources/lookup', () => ({
	lookupCandidatesFor: async () => ({ ol: {}, gb: {}, fetchedAt: '2026-11-22T00:00:00Z' }),
}));

// Non-literal path keeps the admin file out of the root typecheck.
const bulkPath = resolve(__dirname, '../../admin/app/_actions/bulk.ts');
type Res = { slug: string; status: string; message?: string };
type Bulk = {
	refetchCover: (slug: string) => Promise<Res>;
	fillEmpty: (slug: string) => Promise<Res>;
};
const load = async (): Promise<Bulk> => (await import(/* @vite-ignore */ bulkPath)) as Bulk;

const CONN = { code: '08006', message: 'connection failure' };
const NO_ROWS = {
	code: 'PGRST116',
	message: 'JSON object requested, multiple (or no) rows returned',
};

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	db.replies.length = 0;
	log = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => log.mockRestore());

describe.each(['refetchCover', 'fillEmpty'] as const)('%s DB read errors (#377)', (name) => {
	it('surfaces a non-PGRST116 error as the DB error, not "not found"', async () => {
		db.replies.push({ data: null, error: CONN });
		const res = await (await load())[name]('some-book');
		expect(res).toEqual({ slug: 'some-book', status: 'error', message: DB_ERROR.message });
		expect(log).toHaveBeenCalledWith(
			`[admin:${name}]`,
			expect.objectContaining({ code: '08006', message: 'connection failure' }),
		);
	});

	it('still reports "not found" for PGRST116', async () => {
		db.replies.push({ data: null, error: NO_ROWS });
		const res = await (await load())[name]('some-book');
		expect(res).toEqual({ slug: 'some-book', status: 'error', message: 'not found' });
		expect(log).not.toHaveBeenCalled();
	});

	it('still reports "not found" for null data with no error', async () => {
		db.replies.push({ data: null, error: null });
		const res = await (await load())[name]('some-book');
		expect(res).toEqual({ slug: 'some-book', status: 'error', message: 'not found' });
		expect(log).not.toHaveBeenCalled();
	});
});
