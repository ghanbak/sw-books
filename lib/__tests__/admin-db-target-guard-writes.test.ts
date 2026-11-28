import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runBulkSequential } from '../bulk-run';

// #487: the #483 target guard on patchBook, refetchCover, fillEmpty and
// mergeBooks. A tab rendered under Local must not write Production: each action
// takes the target its page rendered with and refuses before touching the DB.

const state = vi.hoisted(() => ({
	target: 'prod' as 'local' | 'prod',
	// Every DB entry point: `from(table)` and `rpc(fn)`.
	db: vi.fn(),
}));

vi.mock('../../admin/lib/auth', () => ({ getAdmin: async () => ({ id: 'admin' }) }));
vi.mock('../../admin/lib/supabase-admin', () => ({
	getDbTarget: async () => state.target,
	getSupabaseAdmin: async () => {
		const q: Record<string, (...args: unknown[]) => unknown> = {};
		for (const op of ['select', 'update', 'eq', 'is']) q[op] = () => q;
		const row = {
			id: 'b1',
			updated_at: '2026-11-01T00:00:00Z',
			title: 'Lost Stars',
			author: ['Claudia Gray'],
			primary_isbn: '9781484724996',
			isbn: ['9781484724996'],
			cover_image: null,
			publisher: null,
		};
		q.single = async () => ({ data: row, error: null });
		q.maybeSingle = async () => ({ data: row, error: null });
		return {
			from: (...args: unknown[]) => {
				state.db('from', ...args);
				return q;
			},
			rpc: async (...args: unknown[]) => {
				state.db('rpc', ...args);
				return { data: row, error: null };
			},
		};
	},
}));
// Root has no `next`: bare id for CI, admin path for a local run with admin deps.
vi.mock('next/cache', () => ({ revalidateTag: () => {} }));
vi.mock('../../admin/node_modules/next/cache.js', () => ({ revalidateTag: () => {} }));
vi.mock('../sources/covers', () => ({ headCheckCover: async () => true }));
vi.mock('../sources/google-books', () => ({ fetchVolumes: async () => null }));
vi.mock('../sources/open-library', () => ({ coverByIsbnUrl: (i: string) => `https://ol/${i}` }));
vi.mock('../sources/lookup', () => ({
	lookupCandidatesFor: async () => ({
		ol: { publisher: 'Disney Lucasfilm Press' },
		gb: {},
		fetchedAt: '2026-11-28T00:00:00Z',
	}),
}));

type Res = { ok: boolean; error?: { code: string; message: string } };
type ItemRes = { slug: string; status: string; code?: string; message?: string };
type Books = {
	patchBook: (id: string, at: string | null, raw: unknown, target: string) => Promise<Res>;
	mergeBooks: (survivor: string, losers: string[], target: string) => Promise<Res>;
};
type Bulk = {
	refetchCover: (slug: string, target: string) => Promise<ItemRes>;
	fillEmpty: (slug: string, target: string) => Promise<ItemRes>;
};
// Non-literal paths keep the admin files out of the root typecheck.
const actions = (name: string) => resolve(__dirname, `../../admin/app/_actions/${name}.ts`);
const loadBooks = async () => (await import(/* @vite-ignore */ actions('books'))) as Books;
const loadBulk = async () => (await import(/* @vite-ignore */ actions('bulk'))) as Bulk;
const source = (path: string) => readFileSync(resolve(__dirname, '../../admin', path), 'utf-8');

const MESSAGE = 'Database target changed in another tab. Reload first.';

beforeEach(() => {
	state.target = 'prod';
	state.db.mockReset();
});

describe('a stale rendered target is refused before any DB call (#487)', () => {
	it('patchBook', async () => {
		const { patchBook } = await loadBooks();
		const res = await patchBook('b1', '2026-11-01T00:00:00Z', { title: 'X' }, 'local');
		// No-DB first, so a missing guard fails here rather than on the result shape.
		expect(state.db).not.toHaveBeenCalled();
		expect(res).toEqual({ ok: false, error: { code: 'TARGET_CHANGED', message: MESSAGE } });
	});

	it('mergeBooks', async () => {
		const { mergeBooks } = await loadBooks();
		const res = await mergeBooks('b1', ['b2'], 'local');
		expect(state.db).not.toHaveBeenCalled();
		expect(res).toEqual({ ok: false, error: { code: 'TARGET_CHANGED', message: MESSAGE } });
	});

	it('refetchCover', async () => {
		const { refetchCover } = await loadBulk();
		const res = await refetchCover('lost-stars', 'local');
		expect(state.db).not.toHaveBeenCalled();
		expect(res).toEqual({
			slug: 'lost-stars',
			status: 'error',
			code: 'TARGET_CHANGED',
			message: MESSAGE,
		});
	});

	it('fillEmpty', async () => {
		const { fillEmpty } = await loadBulk();
		const res = await fillEmpty('lost-stars', 'local');
		expect(state.db).not.toHaveBeenCalled();
		expect(res).toEqual({
			slug: 'lost-stars',
			status: 'error',
			code: 'TARGET_CHANGED',
			message: MESSAGE,
		});
	});

	it('an unknown target is refused too', async () => {
		const { patchBook } = await loadBooks();
		const res = await patchBook('b1', null, { title: 'X' }, 'staging');
		expect(state.db).not.toHaveBeenCalled();
		expect(res.error?.code).toBe('TARGET_CHANGED');
	});
});

describe('a matching rendered target still writes (#487)', () => {
	it('patchBook updates', async () => {
		const { patchBook } = await loadBooks();
		const res = await patchBook('b1', '2026-11-01T00:00:00Z', { title: 'X' }, 'prod');
		expect(res.ok).toBe(true);
		expect(state.db).toHaveBeenCalledWith('from', 'books');
	});

	it('mergeBooks calls merge_books', async () => {
		const { mergeBooks } = await loadBooks();
		const res = await mergeBooks('b1', ['b2'], 'prod');
		expect(res.ok).toBe(true);
		expect(state.db).toHaveBeenCalledWith('rpc', 'merge_books', {
			survivor: 'b1',
			losers: ['b2'],
			resolution: {},
		});
	});

	it('refetchCover and fillEmpty update', async () => {
		state.target = 'local';
		const { refetchCover, fillEmpty } = await loadBulk();
		expect((await refetchCover('lost-stars', 'local')).status).toBe('updated');
		expect((await fillEmpty('lost-stars', 'local')).status).toBe('updated');
	});
});

describe('a bulk run stops at the first TARGET_CHANGED (#487)', () => {
	it('skips the remaining items and reports the refusal', async () => {
		const fn = vi.fn(async (item: { slug: string }) =>
			item.slug === 'b'
				? { status: 'error', code: 'TARGET_CHANGED', message: MESSAGE }
				: { status: 'updated' },
		);
		const onSettled = vi.fn();
		const summary = await runBulkSequential({
			items: [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }],
			fn,
			onProgress: () => {},
			onSettled,
		});
		expect(fn).toHaveBeenCalledTimes(2);
		expect(summary).toEqual({
			updated: 1,
			failures: [],
			total: 3,
			stopped: { code: 'TARGET_CHANGED', message: MESSAGE },
		});
		expect(onSettled).toHaveBeenCalledWith(summary);
	});
});

describe('client call sites send the rendered target (#487)', () => {
	it('the inline-edit queue passes dbTarget to patchBook', () => {
		const table = source('app/admin/books/_components/books-table.tsx');
		expect(table).toMatch(/patchBook\(\s*id,\s*at,\s*\{ \[field\]: value \},\s*dbTarget,?\s*\)/);
	});

	it('both bulk runs pass dbTarget', () => {
		const table = source('app/admin/books/_components/books-table.tsx');
		expect(table).toMatch(/refetchCover\(\s*r\.slug,\s*dbTarget,?\s*\)/);
		expect(table).toMatch(/fillEmpty\(\s*r\.slug,\s*dbTarget,?\s*\)/);
	});

	it('a stopped bulk run shows the Reload toast', () => {
		const table = source('app/admin/books/_components/books-table.tsx');
		const at = table.indexOf('if (stopped)');
		expect(at).toBeGreaterThan(-1);
		expect(table.slice(at, at + 300)).toMatch(
			/toast\.error\(\s*stopped\.message,\s*\{\s*action: \{ label: 'Reload', onClick: \(\) => router\.refresh\(\) \}/,
		);
	});

	it('bulk actions forward the target to patchBook', () => {
		const bulk = source('app/_actions/bulk.ts');
		expect(bulk).toMatch(
			/patchBook\(\s*book\.id,\s*book\.updated_at,\s*\{ cover_image: url \},\s*expectedTarget,?\s*\)/,
		);
		expect(bulk).toMatch(
			/patchBook\(\s*book\.id,\s*book\.updated_at,\s*patch,\s*expectedTarget,?\s*\)/,
		);
	});

	it('the book page passes its target to both editors', () => {
		const page = source('app/admin/books/[slug]/page.tsx');
		expect(page).toMatch(/getDbTarget\(\)/);
		expect(page).toMatch(/<DiffView[^>]*\bdbTarget=\{target\}/);
		expect(page).toMatch(/<ManualFieldsForm[^>]*\bdbTarget=\{target\}/);
	});

	it('diff apply and manual save pass dbTarget and offer Reload on TARGET_CHANGED', () => {
		const diff = source('app/admin/books/[slug]/_components/diff-view.tsx');
		expect(diff).toMatch(/patchBook\(\s*book\.id,\s*book\.updated_at,\s*patch,\s*dbTarget,?\s*\)/);
		const manual = source('app/admin/books/[slug]/_components/manual-fields-form.tsx');
		expect(manual).toMatch(/patchBook\(\s*bookId,\s*updatedAt,\s*patch,\s*dbTarget,?\s*\)/);
		for (const [path, src] of [
			['diff-view', diff],
			['manual-fields-form', manual],
			['books-table', source('app/admin/books/_components/books-table.tsx')],
		]) {
			expect(src, path).toMatch(
				/code === 'CONFLICT' \|\| res\.error\.code === 'TARGET_CHANGED'\)\s*\{\s*toast\.error\(res\.error\.message, \{\s*action: \{ label: 'Reload', onClick: \(\) => router\.refresh\(\) \}/,
			);
		}
	});

	it('/admin/books/new shows the target it will write to', () => {
		const page = source('app/admin/books/new/page.tsx');
		expect(page).toMatch(/<DbTargetLabel\s+target=\{target\}\s*\/>/);
	});
});
