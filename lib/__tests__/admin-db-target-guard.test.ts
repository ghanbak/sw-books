import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// #483: a tab rendered under one DB target must not delete or insert in the
// other. The cookie is shared by every tab, so the action compares the target
// the page rendered with against the one the request resolves to.

const state = vi.hoisted(() => ({
	target: 'prod' as 'local' | 'prod',
	row: { slug: 'lost-stars' } as { slug: string } | null,
	insert: vi.fn(),
	delete: vi.fn(),
}));

vi.mock('../../admin/lib/auth', () => ({ getAdmin: async () => ({ id: 'admin' }) }));
vi.mock('../../admin/lib/supabase-admin', () => ({
	getDbTarget: async () => state.target,
	getSupabaseAdmin: async () => ({
		from: () => {
			const q: Record<string, (...args: unknown[]) => unknown> = {};
			for (const op of ['select', 'eq', 'like']) q[op] = () => q;
			q.maybeSingle = async () => ({ data: state.row, error: null });
			q.single = async () => ({ data: { id: 'b1', slug: 'new-book' }, error: null });
			q.insert = (...args: unknown[]) => {
				state.insert(...args);
				return q;
			};
			q.delete = (...args: unknown[]) => {
				state.delete(...args);
				return { eq: async () => ({ error: null }) };
			};
			return q;
		},
	}),
}));
// Root has no `next`: bare id for CI, admin path for a local run with admin deps.
vi.mock('next/cache', () => ({ revalidateTag: () => {} }));
vi.mock('../../admin/node_modules/next/cache.js', () => ({ revalidateTag: () => {} }));

type Res = { ok: boolean; error?: { code: string; message: string } };
type Books = {
	deleteBook: (id: string, typedSlug: string, expectedTarget: string) => Promise<Res>;
	createBook: (raw: unknown, expectedTarget: string) => Promise<Res>;
};
// Non-literal path keeps the admin file out of the root typecheck.
const booksPath = resolve(__dirname, '../../admin/app/_actions/books.ts');
const load = async () => (await import(/* @vite-ignore */ booksPath)) as Books;
const source = (path: string) => readFileSync(resolve(__dirname, '../../admin', path), 'utf-8');

const NEW_BOOK = { title: 'New Book', slug: 'new-book', canon: 'Canon', type: 'Adult Novel' };

beforeEach(() => {
	state.target = 'prod';
	state.row = { slug: 'lost-stars' };
	state.insert.mockReset();
	state.delete.mockReset();
});

describe('deleteBook refuses a target the page was not rendered for (#483)', () => {
	it('returns TARGET_CHANGED and never deletes', async () => {
		const { deleteBook } = await load();
		const res = await deleteBook('b1', 'lost-stars', 'local');
		// No-write first, so a missing guard fails here rather than on the result shape.
		expect(state.delete).not.toHaveBeenCalled();
		expect(res).toEqual({
			ok: false,
			error: {
				code: 'TARGET_CHANGED',
				message: 'Database target changed in another tab. Reload first.',
			},
		});
	});

	it('deletes when the rendered target matches', async () => {
		const { deleteBook } = await load();
		const res = await deleteBook('b1', 'lost-stars', 'prod');
		expect(res).toEqual({ ok: true, data: { slug: 'lost-stars' } });
		expect(state.delete).toHaveBeenCalledTimes(1);
	});
});

describe('createBook refuses a target the page was not rendered for (#483)', () => {
	// Slug is free, so without the guard each case would reach insert().
	beforeEach(() => {
		state.row = null;
	});

	it('returns TARGET_CHANGED and never inserts', async () => {
		const { createBook } = await load();
		const res = await createBook(NEW_BOOK, 'local');
		expect(state.insert).not.toHaveBeenCalled();
		expect(res.ok).toBe(false);
		expect(res.error?.code).toBe('TARGET_CHANGED');
	});

	it('refuses a missing or unknown target', async () => {
		const { createBook } = await load();
		const res = await createBook(NEW_BOOK, 'staging');
		expect(state.insert).not.toHaveBeenCalled();
		expect(res.error?.code).toBe('TARGET_CHANGED');
	});

	it('inserts when the rendered target matches (local tab, local cookie)', async () => {
		state.target = 'local';
		const { createBook } = await load();
		const res = await createBook(NEW_BOOK, 'local');
		expect(res.ok).toBe(true);
		expect(state.insert).toHaveBeenCalledTimes(1);
	});
});

describe('client call sites send the rendered target (#483)', () => {
	it('the catalog page passes its target to the table', () => {
		const page = source('app/admin/books/page.tsx');
		expect(page).toMatch(/<BooksTable[\s\S]*?dbTarget=\{target\}/);
	});

	it('the new-book page passes its target to the form', () => {
		const page = source('app/admin/books/new/page.tsx');
		expect(page).toMatch(/getDbTarget\(\)/);
		expect(page).toMatch(/<NewBookForm\s+dbTarget=\{target\}/);
	});

	it('deleteBook is called with the rendered target', () => {
		const table = source('app/admin/books/_components/books-table.tsx');
		expect(table).toMatch(/deleteBook\(\s*id,\s*typed\.trim\(\),\s*dbTarget\s*\)/);
		expect(table).toMatch(/dbTarget=\{table\.options\.meta[!?]\.?\.dbTarget\}/);
		expect(table).toMatch(/meta: \{[^}]*\bdbTarget\b[^}]*\}/);
	});

	it('createBook is called with the rendered target', () => {
		const form = source('app/admin/books/new/_components/new-book-form.tsx');
		expect(form).toMatch(/createBook\(\s*\{[\s\S]*?\},\s*dbTarget,?\s*\)/);
	});

	it('both call sites offer a Reload on TARGET_CHANGED', () => {
		for (const path of [
			'app/admin/books/_components/books-table.tsx',
			'app/admin/books/new/_components/new-book-form.tsx',
		]) {
			const src = source(path);
			const at = src.indexOf("'TARGET_CHANGED'");
			expect(at, path).toBeGreaterThan(-1);
			expect(src.slice(at, at + 300), path).toMatch(
				/label: 'Reload', onClick: \(\) => router\.refresh\(\)/,
			);
		}
	});
});
