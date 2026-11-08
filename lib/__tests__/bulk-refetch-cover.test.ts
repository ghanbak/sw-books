import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFLICT_ERROR } from '../stale-write';

// Drives the real admin `refetchCover` → `patchBook` → `guardedUpdate` path with
// a recording fake Supabase client. vitest.config maps admin's `@/` and `@app/`
// aliases; only I/O modules are mocked.

type Call = { op: string; args: unknown[] };

const db = vi.hoisted(() => ({
	calls: [] as Array<Array<{ op: string; args: unknown[] }>>,
	// One reply per awaited query, in call order.
	replies: [] as Array<{ data: unknown; error: unknown }>,
	coverUrl: (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
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
	getSupabaseAdmin: async () => ({ from: () => query() }),
}));
// Root has no `next`. Bare id covers CI (no admin deps, import stays
// unresolved); the path covers a local run where admin's install resolves it.
vi.mock('next/cache', () => ({ revalidateTag: () => {} }));
vi.mock('../../admin/node_modules/next/cache.js', () => ({ revalidateTag: () => {} }));
vi.mock('../sources/covers', () => ({ headCheckCover: async () => true }));
vi.mock('../sources/google-books', () => ({ fetchVolumes: async () => null }));
vi.mock('../sources/open-library', () => ({
	coverByIsbnUrl: (isbn: string) => db.coverUrl(isbn),
}));
vi.mock('../../admin/app/_actions/lookup', () => ({
	lookupCandidates: async () => ({ ok: false }),
}));

// Non-literal path keeps the admin file out of the root typecheck (its
// `@app/*` aliases only resolve under admin/tsconfig.json).
const bulkPath = resolve(__dirname, '../../admin/app/_actions/bulk.ts');
type Bulk = {
	refetchCover: (slug: string) => Promise<{ slug: string; status: string; message?: string }>;
};
const load = async (): Promise<Bulk> => (await import(/* @vite-ignore */ bulkPath)) as Bulk;

const LOADED = '2026-11-01T00:00:00Z';
const book = {
	id: 'b1',
	updated_at: LOADED,
	primary_isbn: '9780593157718',
	isbn: ['9780593157718'],
	cover_image: 'https://example.com/old.jpg',
};

const defaultCover = db.coverUrl;
beforeEach(() => {
	db.calls.length = 0;
	db.replies.length = 0;
	db.coverUrl = defaultCover;
});

describe('refetchCover stale-write guard (#194)', () => {
	it('reports CONFLICT and never makes an unguarded update when the row changed', async () => {
		db.replies.push(
			{ data: book, error: null }, // initial read
			{ data: null, error: null }, // guarded update: no row matched
			{ data: { updated_at: '2026-11-02T00:00:00Z' }, error: null }, // re-read
		);
		const { refetchCover } = await load();
		const res = await refetchCover('some-book');

		expect(res).toEqual({ slug: 'some-book', status: 'error', message: CONFLICT_ERROR.message });
		const updates = db.calls.filter((c) => c.some((x) => x.op === 'update'));
		expect(updates).toHaveLength(1);
		const [update] = updates;
		expect(update).toContainEqual({ op: 'eq', args: ['id', 'b1'] });
		expect(update).toContainEqual({ op: 'eq', args: ['updated_at', LOADED] });
	});

	it('reads updated_at with the row it guards on', async () => {
		db.replies.push({ data: book, error: null }, { data: { ...book }, error: null });
		const { refetchCover } = await load();
		const res = await refetchCover('some-book');
		expect(res.status).toBe('updated');
		const select = db.calls[0].find((x) => x.op === 'select');
		expect(String(select?.args[0])).toMatch(/\bupdated_at\b/);
	});

	it('validates the new cover through patchSchema (http(s) only)', async () => {
		db.coverUrl = () => 'javascript:alert(1)';
		db.replies.push({ data: book, error: null });
		const { refetchCover } = await load();
		const res = await refetchCover('some-book');
		expect(res.status).toBe('error');
		expect(db.calls.some((c) => c.some((x) => x.op === 'update'))).toBe(false);
	});
});
