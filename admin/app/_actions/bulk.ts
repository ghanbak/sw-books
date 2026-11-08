'use server';

import { getAdmin } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { headCheckCover } from '@app/sources/covers';
import { fetchVolumes } from '@app/sources/google-books';
import { coverByIsbnUrl } from '@app/sources/open-library';
import { patchBook } from './books';
import { lookupCandidates } from './lookup';

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
	const { data: book } = await supabaseAdmin
		.from('books')
		.select('id, updated_at, primary_isbn, isbn, cover_image')
		.eq('slug', slug)
		.single();
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
	const look = await lookupCandidates(slug);
	if (!look.ok) return { slug, status: 'error', message: look.error.message };

	const supabaseAdmin = await getSupabaseAdmin();
	const { data: book } = await supabaseAdmin
		.from('books')
		.select(
			'id, updated_at, cover_image, publisher, date_published, language, synopsis, format, isbn, primary_isbn',
		)
		.eq('slug', slug)
		.single();
	if (!book) return { slug, status: 'error', message: 'not found' };

	const { ol, gb } = look.data;
	const patch: Record<string, unknown> = {};

	for (const f of ['cover_image', 'publisher', 'date_published', 'language', 'synopsis'] as const) {
		if (book[f] == null) {
			const v = ol[f] ?? gb[f] ?? null;
			if (v != null) patch[f] = v;
		}
	}
	if ((book.format?.length ?? 0) === 0) {
		const v = ol.format ?? gb.format;
		if (v?.length) patch.format = v;
	}
	if ((book.isbn?.length ?? 0) === 0) {
		const v = ol.isbn ?? gb.isbn;
		if (v?.length) {
			patch.isbn = v;
			patch.primary_isbn =
				book.primary_isbn && v.includes(book.primary_isbn) ? book.primary_isbn : v[0];
		}
	}

	if (Object.keys(patch).length === 0) return { slug, status: 'unchanged' };
	// Guarded on the updated_at read above: an edit that lands during the
	// (slow) lookup is not overwritten.
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
