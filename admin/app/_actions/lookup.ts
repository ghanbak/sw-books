'use server';

import { getAdmin } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { toIsbn13 } from '@app/isbn';
import { lookupCandidatesFor } from '@app/sources/lookup';
import type { LookupResult } from '@app/sources/types';

type ActionError = { code: string; message: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

// The OL + Google Books candidate builders live in lib/sources/lookup.ts (shared
// with the CLI scripts); these server actions add the auth gate + DB read.

/**
 * Fetch Open Library + Google Books candidates for a book, in parallel. Anchors
 * on the book's ISBN when present; otherwise searches both sources by
 * title + author. Either source failing/empty still returns a result with
 * whichever succeeded.
 */
export async function lookupCandidates(slug: string): Promise<Result<LookupResult>> {
	if (!(await getAdmin())) return { ok: false, error: { code: 'AUTH', message: 'not authorized' } };
	const supabaseAdmin = await getSupabaseAdmin();
	const { data: book, error } = await supabaseAdmin
		.from('books')
		.select('isbn, primary_isbn, title, author')
		.eq('slug', slug)
		.single();
	if (error || !book) {
		return {
			ok: false,
			error: { code: 'NOT_FOUND', message: error?.message ?? `no book for slug "${slug}"` },
		};
	}

	const probeIsbn = book.primary_isbn ?? book.isbn?.[0] ?? null;
	const author = book.author?.[0] ?? '';

	return {
		ok: true,
		data: await lookupCandidatesFor({ isbn: probeIsbn, title: book.title, author }),
	};
}

export type NewBookSearch = { isbn?: string; title?: string; author?: string };

/**
 * Look up OL + GB candidates for a book that does NOT exist yet (the "add book"
 * flow), from raw input rather than a stored row. Anchors on the ISBN when given
 * (normalized to ISBN-13), else searches by title + author. Either source
 * failing/empty still returns whichever succeeded.
 */
export async function searchForNewBook(input: NewBookSearch): Promise<Result<LookupResult>> {
	if (!(await getAdmin())) return { ok: false, error: { code: 'AUTH', message: 'not authorized' } };
	let isbn: string | null = null;
	if (input.isbn?.trim()) {
		isbn = toIsbn13(input.isbn.trim());
		if (!isbn) {
			return {
				ok: false,
				error: { code: 'INVALID_ISBN', message: `"${input.isbn}" is not a valid ISBN` },
			};
		}
	}
	const title = input.title?.trim() ?? '';
	const author = input.author?.trim() ?? '';
	if (!isbn && !title) {
		return { ok: false, error: { code: 'EMPTY', message: 'provide an ISBN or a title' } };
	}

	return { ok: true, data: await lookupCandidatesFor({ isbn, title, author }) };
}
