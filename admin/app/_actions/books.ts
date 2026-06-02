'use server';

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ensureUniqueSlug } from '@app/slug';
import type { Database, Json } from '@app/types';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';

type BookRow = Database['public']['Tables']['books']['Row'];
type ActionError = { code: string; message: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const DATE = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
	.nullable();

/** Shared field rules — patch and create derive from these so they never drift. */
const bookFields = {
	title: z.string().min(1),
	author: z.array(z.string()),
	cover_image: z.string().nullable(),
	publisher: z.string().nullable(),
	date_published: DATE,
	language: z.string().nullable(),
	format: z.array(z.string()),
	synopsis: z.string().nullable(),
	isbn: z.array(z.string()),
	primary_isbn: z.string().nullable(),
	canon: z.enum(['Canon', 'Legends']),
	type: z.enum(['Adult Novel', 'YA Novel', 'Middle Grade Novel']),
	era: z.string().nullable(),
	series_name: z.string().nullable(),
	series_order: z.number().int().nullable(),
	timeline_order: z.number().nullable(),
};

const patchSchema = z
	.object(bookFields)
	.partial()
	// Lenient: a patch may omit isbn while setting primary_isbn (partial update).
	.refine((p) => !p.isbn || !p.primary_isbn || p.isbn.includes(p.primary_isbn), {
		message: 'primary_isbn must be one of isbn[]',
		path: ['primary_isbn'],
	});

export type BookPatchInput = z.input<typeof patchSchema>;

export async function patchBook(id: string, raw: unknown): Promise<Result<BookRow>> {
	const parsed = patchSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			error: { code: 'INVALID', message: parsed.error.issues[0]?.message ?? 'invalid patch' },
		};
	}
	if (Object.keys(parsed.data).length === 0) {
		return { ok: false, error: { code: 'EMPTY', message: 'no fields to update' } };
	}

	const supabaseAdmin = await getSupabaseAdmin();
	const { data, error } = await supabaseAdmin
		.from('books')
		.update(parsed.data)
		.eq('id', id)
		.select()
		.single();

	if (error) return { ok: false, error: { code: 'DB', message: error.message } };
	revalidateTag('books');
	return { ok: true, data };
}

/**
 * Create schema: title/slug/canon/type required; arrays default to [] (DB
 * NOT NULL); nullable scalars default to null. The primary_isbn refine is
 * STRICT here (unlike patch): a non-null primary_isbn must be a member of a
 * populated isbn[].
 */
const createSchema = z
	.object({
		...bookFields,
		slug: z
			.string()
			.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case (a-z, 0-9, hyphens)'),
		author: z.array(z.string()).default([]),
		isbn: z.array(z.string()).default([]),
		format: z.array(z.string()).default([]),
		cover_image: z.string().nullable().default(null),
		publisher: z.string().nullable().default(null),
		date_published: DATE.default(null),
		language: z.string().nullable().default(null),
		synopsis: z.string().nullable().default(null),
		primary_isbn: z.string().nullable().default(null),
		era: z.string().nullable().default(null),
		series_name: z.string().nullable().default(null),
		series_order: z.number().int().nullable().default(null),
		timeline_order: z.number().nullable().default(null),
	})
	.refine((d) => d.primary_isbn == null || d.isbn.includes(d.primary_isbn), {
		message: 'primary_isbn must be one of isbn[]',
		path: ['primary_isbn'],
	});

export type BookCreateInput = z.input<typeof createSchema>;

/**
 * Insert a new catalog book. Slug must be unique; a collision returns a friendly
 * SLUG_TAKEN error with a suggested alternative rather than a raw DB error.
 */
export async function createBook(raw: unknown): Promise<Result<BookRow>> {
	const parsed = createSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			error: { code: 'INVALID', message: parsed.error.issues[0]?.message ?? 'invalid book' },
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
		return { ok: false, error: { code: 'DB', message: error.message } };
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
	const supabaseAdmin = await getSupabaseAdmin();
	const { data: book, error: fetchErr } = await supabaseAdmin
		.from('books')
		.select('slug')
		.eq('id', id)
		.maybeSingle();
	if (fetchErr) return { ok: false, error: { code: 'DB', message: fetchErr.message } };
	if (!book) return { ok: false, error: { code: 'NOT_FOUND', message: 'book not found' } };
	if (typedSlug.trim() !== book.slug) {
		return {
			ok: false,
			error: { code: 'CONFIRM', message: `type "${book.slug}" exactly to confirm` },
		};
	}

	const { error } = await supabaseAdmin.from('books').delete().eq('id', id);
	if (error) return { ok: false, error: { code: 'DB', message: error.message } };
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
	if (error || !data) {
		return { ok: false, error: { code: 'DB', message: error?.message ?? 'merge failed' } };
	}
	revalidateTag('books');
	return { ok: true, data };
}
