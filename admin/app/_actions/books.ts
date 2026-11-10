'use server';

import { getAdmin } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { type ActionError, dbError } from '@app/action-errors';
import { createSchema, firstIssueMessage, patchSchema } from '@app/book-schema';
import { ensureUniqueSlug } from '@app/slug';
import { guardedUpdate } from '@app/stale-write';
import type { Database, Json } from '@app/types';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';

type BookRow = Database['public']['Tables']['books']['Row'];
type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

/** The `updated_at` the client loaded the row with (ISO timestamptz, or null). */
const expectedUpdatedAt = z.string().min(1).max(64).nullable();

/**
 * Patch a book. `loadedUpdatedAt` is the row's `updated_at` as the caller loaded
 * it; if the row has been written since, the update is rejected with CONFLICT
 * instead of overwriting the newer data.
 */
export async function patchBook(
	id: string,
	loadedUpdatedAt: string | null,
	raw: unknown,
): Promise<Result<BookRow>> {
	if (!(await getAdmin())) return { ok: false, error: { code: 'AUTH', message: 'not authorized' } };
	const expected = expectedUpdatedAt.safeParse(loadedUpdatedAt);
	if (!expected.success) {
		return { ok: false, error: { code: 'INVALID', message: 'missing updated_at' } };
	}
	const parsed = patchSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			error: { code: 'INVALID', message: firstIssueMessage(parsed.error, 'invalid patch') },
		};
	}
	if (Object.keys(parsed.data).length === 0) {
		return { ok: false, error: { code: 'EMPTY', message: 'no fields to update' } };
	}

	const supabaseAdmin = await getSupabaseAdmin();
	const res = await guardedUpdate<BookRow>('patchBook', expected.data, {
		update: (at) => {
			const q = supabaseAdmin.from('books').update(parsed.data).eq('id', id);
			return (at === null ? q.is('updated_at', null) : q.eq('updated_at', at))
				.select()
				.maybeSingle();
		},
		current: () => supabaseAdmin.from('books').select('updated_at').eq('id', id).maybeSingle(),
	});
	if (res.ok) revalidateTag('books');
	return res;
}

/**
 * Insert a new catalog book. Slug must be unique; a collision returns a friendly
 * SLUG_TAKEN error with a suggested alternative rather than a raw DB error.
 */
export async function createBook(raw: unknown): Promise<Result<BookRow>> {
	if (!(await getAdmin())) return { ok: false, error: { code: 'AUTH', message: 'not authorized' } };
	const parsed = createSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			error: { code: 'INVALID', message: firstIssueMessage(parsed.error, 'invalid book') },
		};
	}
	const input = parsed.data;

	const supabaseAdmin = await getSupabaseAdmin();
	const { data: clash } = await supabaseAdmin
		.from('books')
		.select('slug')
		.eq('slug', input.slug)
		.maybeSingle();
	if (clash) {
		const { data: all } = await supabaseAdmin.from('books').select('slug');
		const suggestion = ensureUniqueSlug(
			input.slug,
			(all ?? []).map((r) => r.slug),
		);
		return {
			ok: false,
			error: { code: 'SLUG_TAKEN', message: `slug "${input.slug}" is taken — try "${suggestion}"` },
		};
	}

	const { data, error } = await supabaseAdmin.from('books').insert(input).select().single();
	if (error) {
		if (error.code === '23505') {
			return { ok: false, error: { code: 'SLUG_TAKEN', message: `slug "${input.slug}" is taken` } };
		}
		return { ok: false, error: dbError('createBook', error) };
	}
	revalidateTag('books');
	return { ok: true, data };
}

/**
 * Delete a book. Guarded: the caller must type the book's slug, and we compare
 * it against the slug fetched by `id` (so a stale/typo'd slug can't delete a
 * different row). `user_books.book_id ON DELETE CASCADE` removes shelf refs —
 * intended for a genuine "this book shouldn't exist" deletion. No undo; recovery
 * is the CSV backup / Supabase PITR.
 */
export async function deleteBook(id: string, typedSlug: string): Promise<Result<{ slug: string }>> {
	if (!(await getAdmin())) return { ok: false, error: { code: 'AUTH', message: 'not authorized' } };
	const supabaseAdmin = await getSupabaseAdmin();
	const { data: book, error: fetchErr } = await supabaseAdmin
		.from('books')
		.select('slug')
		.eq('id', id)
		.maybeSingle();
	if (fetchErr) return { ok: false, error: dbError('deleteBook', fetchErr) };
	if (!book) return { ok: false, error: { code: 'NOT_FOUND', message: 'book not found' } };
	if (typedSlug.trim() !== book.slug) {
		return {
			ok: false,
			error: { code: 'CONFIRM', message: `type "${book.slug}" exactly to confirm` },
		};
	}

	const { error } = await supabaseAdmin.from('books').delete().eq('id', id);
	if (error) return { ok: false, error: dbError('deleteBook', error) };
	revalidateTag('books');
	return { ok: true, data: { slug: book.slug } };
}

/**
 * Merge duplicate books into a survivor via the `merge_books` Postgres function
 * (atomic: repoints + OR-merges user shelves, unions isbn[]/format[], applies
 * scalar overrides, deletes losers). `resolution` carries optional scalar
 * overrides (e.g. `{ primary_isbn, canon, title, … }`); arrays are auto-unioned.
 */
export async function mergeBooks(
	survivorId: string,
	loserIds: string[],
	resolution: Json = {},
): Promise<Result<BookRow>> {
	if (!(await getAdmin())) return { ok: false, error: { code: 'AUTH', message: 'not authorized' } };
	if (loserIds.length === 0) {
		return { ok: false, error: { code: 'EMPTY', message: 'no books to merge' } };
	}
	if (loserIds.includes(survivorId)) {
		return { ok: false, error: { code: 'INVALID', message: 'survivor cannot also be a loser' } };
	}

	const supabaseAdmin = await getSupabaseAdmin();
	const { data, error } = await supabaseAdmin.rpc('merge_books', {
		survivor: survivorId,
		losers: loserIds,
		resolution,
	});
	if (error) return { ok: false, error: dbError('mergeBooks', error) };
	if (!data) return { ok: false, error: { code: 'DB', message: 'merge failed' } };
	revalidateTag('books');
	return { ok: true, data };
}
