'use server';

import { getAdmin } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { dbError } from '@app/action-errors';
import { headCheckCover } from '@app/sources/covers';
import { fetchVolumes } from '@app/sources/google-books';
import { lookupCandidatesFor } from '@app/sources/lookup';
import {
	buildFillEmptyArrayPatch,
	buildFillEmptyScalarPatch,
	pickFillEmptyCover,
} from '@app/sources/lookup-selection';
import { coverByIsbnUrl } from '@app/sources/open-library';
import { patchBook } from './books';

export type CoverResult = {
	slug: string;
	status: 'updated' | 'unchanged' | 'not-found' | 'error';
	url?: string;
	message?: string;
};

export type FillResult = {
	slug: string;
	status: 'updated' | 'unchanged' | 'error';
	fields?: string[];
	message?: string;
};

type GbCover = {
	items?: Array<{
		volumeInfo?: { imageLinks?: { thumbnail?: string; large?: string; extraLarge?: string } };
	}>;
};

/** Re-source a cover for one book (OL by ISBN, then Google Books) and persist
 * it if a valid candidate differs from the current cover. */
export async function refetchCover(slug: string): Promise<CoverResult> {
	if (!(await getAdmin())) return { slug, status: 'error', message: 'not authorized' };
	const supabaseAdmin = await getSupabaseAdmin();
	const { data: book, error } = await supabaseAdmin
		.from('books')
		.select('id, updated_at, primary_isbn, isbn, cover_image')
		.eq('slug', slug)
		.single();
	// PGRST116 is zero rows; any other error is a failed read, not a missing book.
	if (error && error.code !== 'PGRST116') {
		return { slug, status: 'error', message: dbError('refetchCover', error).message };
	}
	if (!book) return { slug, status: 'error', message: 'not found' };

	const isbn = book.primary_isbn ?? book.isbn?.[0] ?? null;
	if (!isbn) return { slug, status: 'not-found' };

	let url: string | null = null;
	const olUrl = coverByIsbnUrl(isbn);
	if (await headCheckCover(olUrl)) {
		url = olUrl;
	} else {
		const gb = await fetchVolumes<GbCover>(`isbn:${isbn}`, { maxResults: 1 });
		const links = gb?.items?.[0]?.volumeInfo?.imageLinks;
		const raw = links?.extraLarge ?? links?.large ?? links?.thumbnail;
		if (raw) url = raw.replace(/^http:/, 'https:').replace(/&edge=curl/g, '');
	}

	if (!url) return { slug, status: 'not-found' };
	if (url === book.cover_image) return { slug, status: 'unchanged', url };

	// Guarded on the updated_at read above (and validated by patchSchema): an
	// edit that lands during the cover probes is not overwritten (#194).
	const res = await patchBook(book.id, book.updated_at, { cover_image: url });
	if (!res.ok) return { slug, status: 'error', message: res.error.message };
	return { slug, status: 'updated', url };
}

/** Fill only the empty fields of one book from OL/GB candidates. */
export async function fillEmpty(slug: string): Promise<FillResult> {
	if (!(await getAdmin())) return { slug, status: 'error', message: 'not authorized' };
	// One read, before any lookup: the search, the empty-field check and the
	// stale-write guard all use this row (#384).
	const supabaseAdmin = await getSupabaseAdmin();
	const { data: book, error } = await supabaseAdmin
		.from('books')
		.select(
			'id, updated_at, title, author, cover_image, publisher, date_published, language, synopsis, format, isbn, primary_isbn',
		)
		.eq('slug', slug)
		.single();
	if (error && error.code !== 'PGRST116') {
		return { slug, status: 'error', message: dbError('fillEmpty', error).message };
	}
	if (!book) return { slug, status: 'error', message: 'not found' };

	// Same probe as lookupCandidates: anchor on the ISBN, else title + author.
	const candidates = await lookupCandidatesFor({
		isbn: book.primary_isbn ?? book.isbn?.[0] ?? null,
		title: book.title,
		author: book.author?.[0] ?? '',
	});

	// Same source rule as the per-book Fill empty: first non-blank of OL, GB.
	const { cover_image, ...scalars } = buildFillEmptyScalarPatch(book, candidates);
	// OL's ISBN cover URL can 404: write only a cover that passes the head
	// check, falling back to GB, else leave cover_image empty (#353).
	const cover =
		cover_image === undefined ? null : await pickFillEmptyCover(candidates, headCheckCover);
	const patch = {
		...(cover ? { cover_image: cover } : {}),
		...scalars,
		...buildFillEmptyArrayPatch(book, candidates),
	};

	if (Object.keys(patch).length === 0) return { slug, status: 'unchanged' };
	// Guarded on the updated_at read before the lookup: an edit that lands
	// during the (slow) lookup or cover probes fails with CONFLICT (#384).
	const res = await patchBook(book.id, book.updated_at, patch);
	if (!res.ok) return { slug, status: 'error', message: res.error.message };
	return { slug, status: 'updated', fields: Object.keys(patch) };
}

/**
 * Probe whether Google Books is usable right now. Keyless access is quota-
 * limited (HTTP 429), so the bulk ops that rely on GB warn when it's blocked.
 * `keyed` reports whether GOOGLE_BOOKS_API_KEY is configured.
 */
export async function googleBooksStatus(): Promise<{ available: boolean; keyed: boolean }> {
	if (!(await getAdmin())) return { available: false, keyed: false };
	const keyed = !!process.env.GOOGLE_BOOKS_API_KEY;
	const probe = await fetchVolumes('isbn:9780593157718', { maxResults: 1 });
	return { available: probe !== null, keyed };
}
