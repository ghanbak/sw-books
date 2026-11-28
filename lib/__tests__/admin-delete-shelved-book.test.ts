import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// #490: user_books.book_id is ON DELETE RESTRICT, so deleting a shelved book fails
// with 23503. deleteBook maps that to a clear "merge instead" error with the count.

type PgError = { code: string; message: string; details?: string | null; hint?: string | null };

const state = vi.hoisted(() => ({
	deleteError: null as PgError | null,
	shelfCount: 0 as number | null,
	shelfError: null as PgError | null,
	tables: [] as string[],
	countFilters: [] as unknown[][],
	revalidateTag: vi.fn((_tag: string) => {}),
}));

vi.mock('../../admin/lib/auth', () => ({ getAdmin: async () => ({ id: 'admin' }) }));
vi.mock('../../admin/lib/supabase-admin', () => ({
	getDbTarget: async () => 'local',
	getSupabaseAdmin: async () => ({
		from: (table: string) => {
			state.tables.push(table);
			const q: Record<string, (...args: unknown[]) => unknown> = {};
			q.select = () => q;
			q.eq = (...args: unknown[]) => {
				if (table === 'user_books') state.countFilters.push(args);
				return q;
			};
			q.maybeSingle = async () => ({ data: { slug: 'lost-stars' }, error: null });
			q.delete = () => ({ eq: async () => ({ error: state.deleteError }) });
			// biome-ignore lint/suspicious/noThenProperty: fake postgrest builder is thenable
			q.then = (done: unknown) =>
				(done as (r: unknown) => unknown)({
					data: null,
					count: state.shelfError ? null : state.shelfCount,
					error: state.shelfError,
				});
			return q;
		},
	}),
}));
// Root has no `next`: bare id for CI, admin path for a local run with admin deps.
const nextCache = { revalidateTag: state.revalidateTag };
vi.mock('next/cache', () => nextCache);
vi.mock('../../admin/node_modules/next/cache.js', () => nextCache);

type Res = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
type Books = {
	deleteBook: (id: string, typedSlug: string, expectedTarget: string) => Promise<Res>;
};
// Non-literal path keeps the admin file out of the root typecheck.
const booksPath = resolve(__dirname, '../../admin/app/_actions/books.ts');
const load = async () => (await import(/* @vite-ignore */ booksPath)) as Books;

const FK_VIOLATION: PgError = {
	code: '23503',
	message:
		'update or delete on table "books" violates foreign key constraint "user_books_book_id_fkey" on table "user_books"',
	details: 'Key (id)=(b1) is still referenced from table "user_books".',
};

beforeEach(() => {
	state.deleteError = null;
	state.shelfCount = 0;
	state.shelfError = null;
	state.tables.length = 0;
	state.countFilters.length = 0;
	state.revalidateTag.mockClear();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe('deleteBook on a shelved book (#490)', () => {
	it('maps 23503 to a merge-instead error with the shelf count', async () => {
		state.deleteError = FK_VIOLATION;
		state.shelfCount = 3;
		const { deleteBook } = await load();
		const res = await deleteBook('b1', 'lost-stars', 'local');
		expect(res).toEqual({
			ok: false,
			error: { code: 'SHELVED', message: '3 shelf entries reference this book; merge instead' },
		});
		expect(state.tables).toContain('user_books');
		expect(state.countFilters).toContainEqual(['book_id', 'b1']);
		expect(state.revalidateTag).not.toHaveBeenCalled();
		expect(console.error).toHaveBeenCalled();
	});

	it('uses the singular for one shelf entry', async () => {
		state.deleteError = FK_VIOLATION;
		state.shelfCount = 1;
		const { deleteBook } = await load();
		const res = await deleteBook('b1', 'lost-stars', 'local');
		expect(res.error).toEqual({
			code: 'SHELVED',
			message: '1 shelf entry references this book; merge instead',
		});
	});

	it('still says merge instead when the count read fails', async () => {
		state.deleteError = FK_VIOLATION;
		state.shelfError = { code: 'XX000', message: 'boom' };
		const { deleteBook } = await load();
		const res = await deleteBook('b1', 'lost-stars', 'local');
		expect(res.error).toEqual({
			code: 'SHELVED',
			message: 'Shelf entries reference this book; merge instead',
		});
	});

	it('drops the number when the rows went between the delete and the count', async () => {
		state.deleteError = FK_VIOLATION;
		state.shelfCount = 0;
		const { deleteBook } = await load();
		const res = await deleteBook('b1', 'lost-stars', 'local');
		expect(res.error?.message).toBe('Shelf entries reference this book; merge instead');
	});

	it('never leaks the raw Postgres message', async () => {
		state.deleteError = FK_VIOLATION;
		state.shelfCount = 2;
		const { deleteBook } = await load();
		const res = await deleteBook('b1', 'lost-stars', 'local');
		expect(res.error?.message).not.toMatch(/user_books_book_id_fkey|violates|Key \(id\)/);
	});

	it('other delete errors keep the generic DB error and skip the count', async () => {
		state.deleteError = { code: 'XX000', message: 'internal' };
		const { deleteBook } = await load();
		const res = await deleteBook('b1', 'lost-stars', 'local');
		expect(res).toEqual({
			ok: false,
			error: { code: 'DB', message: 'Database error. Details are in the server log.' },
		});
		expect(state.tables).not.toContain('user_books');
	});

	it('an unshelved book still deletes without a count read', async () => {
		const { deleteBook } = await load();
		const res = await deleteBook('b1', 'lost-stars', 'local');
		expect(res).toEqual({ ok: true, data: { slug: 'lost-stars' } });
		expect(state.tables).not.toContain('user_books');
		expect(state.revalidateTag).toHaveBeenCalledWith('books');
	});
});
