'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { toIsbn13 } from '@app/isbn';
import { fetchVolumes } from '@app/sources/google-books';
import {
	coverByIdUrl,
	coverByIsbnUrl,
	fetchByIsbn,
	searchByTitleAuthor,
} from '@app/sources/open-library';
import type { BookCandidate, LookupResult } from '@app/sources/types';

type ActionError = { code: string; message: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

// --- response shapes (only the fields we read) ---
type OlEdition = {
	publishers?: string[];
	publish_date?: string;
	covers?: number[];
	languages?: Array<{ key?: string }>;
	isbn_13?: string[];
	isbn_10?: string[];
	physical_format?: string;
};

type OlSearch = {
	docs?: Array<{ cover_edition_key?: string; isbn?: string[] }>;
};

type GbVolumes = {
	items?: Array<{
		volumeInfo?: {
			publisher?: string;
			publishedDate?: string;
			description?: string;
			language?: string;
			imageLinks?: { thumbnail?: string; medium?: string; large?: string; extraLarge?: string };
			industryIdentifiers?: Array<{ type: string; identifier: string }>;
		};
	}>;
};

function toIsoDate(raw?: string | null): string | null {
	if (!raw) return null;
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return null;
	return d.toISOString().slice(0, 10);
}

function normalizeLanguage(code?: string | null): string | null {
	if (!code) return null;
	if (code === '/languages/eng' || code.toLowerCase() === 'en' || code.toLowerCase() === 'eng') {
		return 'English';
	}
	return null;
}

function normalizeIsbns(values: Array<string | undefined>): string[] {
	const out = new Set<string>();
	for (const v of values) {
		if (!v) continue;
		const norm = toIsbn13(v);
		if (norm) out.add(norm);
	}
	return [...out];
}

async function buildOlCandidate(isbn: string): Promise<BookCandidate> {
	const edition = await fetchByIsbn<OlEdition>(isbn);
	if (!edition) return {};
	const coverId = edition.covers?.find((c) => c > 0);
	return {
		isbn: normalizeIsbns([...(edition.isbn_13 ?? []), ...(edition.isbn_10 ?? []), isbn]),
		cover_image: coverId ? coverByIdUrl(coverId) : coverByIsbnUrl(isbn),
		publisher: edition.publishers?.[0] ?? null,
		date_published: toIsoDate(edition.publish_date),
		language: normalizeLanguage(edition.languages?.[0]?.key),
		format: edition.physical_format ? [edition.physical_format] : undefined,
	};
}

async function buildGbCandidate(isbn: string): Promise<BookCandidate> {
	const res = await fetchVolumes<GbVolumes>(`isbn:${isbn}`, { maxResults: 1 });
	const info = res?.items?.[0]?.volumeInfo;
	if (!info) return {};
	const rawCover =
		info.imageLinks?.extraLarge ??
		info.imageLinks?.large ??
		info.imageLinks?.medium ??
		info.imageLinks?.thumbnail;
	const cover = rawCover ? rawCover.replace(/^http:/, 'https:').replace(/&edge=curl/g, '') : null;
	return {
		isbn: normalizeIsbns([...(info.industryIdentifiers?.map((i) => i.identifier) ?? []), isbn]),
		cover_image: cover,
		publisher: info.publisher ?? null,
		date_published: toIsoDate(info.publishedDate),
		language: normalizeLanguage(info.language),
		synopsis: info.description ?? null,
	};
}

/**
 * Fetch Open Library + Google Books candidates for a book, in parallel.
 * Either source failing/empty still returns a result with whichever succeeded.
 */
export async function lookupCandidates(slug: string): Promise<Result<LookupResult>> {
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
	if (!probeIsbn) {
		// No ISBN to anchor on — resolve one via OL title/author search before giving up.
		const search = await searchByTitleAuthor<OlSearch>(book.title, book.author?.[0] ?? '');
		const found = search?.docs?.[0]?.isbn?.find((i) => toIsbn13(i));
		if (!found) {
			return {
				ok: false,
				error: { code: 'NO_ISBN', message: 'book has no ISBN and OL search found none' },
			};
		}
		return runLookups(found);
	}

	return runLookups(probeIsbn);
}

async function runLookups(isbn: string): Promise<Result<LookupResult>> {
	const [ol, gb] = await Promise.allSettled([buildOlCandidate(isbn), buildGbCandidate(isbn)]);
	return {
		ok: true,
		data: {
			ol: ol.status === 'fulfilled' ? ol.value : {},
			gb: gb.status === 'fulfilled' ? gb.value : {},
			fetchedAt: new Date().toISOString(),
		},
	};
}
