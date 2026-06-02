'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { isEnglishIsbn, toIsbn13 } from '@app/isbn';
import { fetchVolumes } from '@app/sources/google-books';
import {
	coverByIdUrl,
	coverByIsbnUrl,
	fetchByIsbn,
	fetchEditionsByWork,
	fetchWork,
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
	works?: Array<{ key?: string }>;
};

type OlEditions = { entries?: OlEdition[] };

type OlSearch = {
	docs?: Array<{
		key?: string;
		cover_i?: number;
		isbn?: string[];
		publisher?: string[];
		first_publish_year?: number;
		language?: string[];
	}>;
};

type OlWork = { description?: string | { value?: string } };

type GbVolumeInfo = {
	publisher?: string;
	publishedDate?: string;
	description?: string;
	language?: string;
	imageLinks?: { thumbnail?: string; medium?: string; large?: string; extraLarge?: string };
	industryIdentifiers?: Array<{ type: string; identifier: string }>;
};
type GbVolumes = { items?: Array<{ volumeInfo?: GbVolumeInfo }> };

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
		// Keep English-group ISBNs only (US/UK/Canada/… audience).
		if (norm && isEnglishIsbn(norm)) out.add(norm);
	}
	return [...out];
}

function mapGbVolumeInfo(info: GbVolumeInfo, extraIsbns: string[] = []): BookCandidate {
	const raw =
		info.imageLinks?.extraLarge ??
		info.imageLinks?.large ??
		info.imageLinks?.medium ??
		info.imageLinks?.thumbnail;
	const cover = raw ? raw.replace(/^http:/, 'https:').replace(/&edge=curl/g, '') : null;
	return {
		isbn: normalizeIsbns([
			...(info.industryIdentifiers?.map((i) => i.identifier) ?? []),
			...extraIsbns,
		]),
		cover_image: cover,
		publisher: info.publisher ?? null,
		date_published: toIsoDate(info.publishedDate),
		language: normalizeLanguage(info.language),
		synopsis: info.description ?? null,
	};
}

// --- ISBN-anchored builders ---
async function buildOlCandidate(isbn: string): Promise<BookCandidate> {
	const edition = await fetchByIsbn<OlEdition>(isbn);
	if (!edition) return {};

	// Aggregate ISBNs across every edition of the work (hardcover, paperback,
	// mass-market, …), not just the one we looked up. normalizeIsbns then keeps
	// the English-group ones. Falls back to the single edition if no work key.
	const isbnPool = [...(edition.isbn_13 ?? []), ...(edition.isbn_10 ?? []), isbn];
	const workKey = edition.works?.[0]?.key;
	if (workKey) {
		const editions = await fetchEditionsByWork<OlEditions>(workKey, 100);
		for (const e of editions?.entries ?? []) {
			isbnPool.push(...(e.isbn_13 ?? []), ...(e.isbn_10 ?? []));
		}
	}

	const coverId = edition.covers?.find((c) => c > 0);
	return {
		isbn: normalizeIsbns(isbnPool),
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
	return info ? mapGbVolumeInfo(info, [isbn]) : {};
}

// --- title/author builders (used when the book has no ISBN) ---
async function buildOlCandidateFromSearch(title: string, author: string): Promise<BookCandidate> {
	const search = await searchByTitleAuthor<OlSearch>(title, author, {
		// search.json omits these from its default response — request them explicitly.
		fields: 'key,cover_i,isbn,publisher,first_publish_year,language',
	});
	const doc = search?.docs?.[0];
	if (!doc) return {};
	const isbns = normalizeIsbns(doc.isbn ?? []);
	const candidate: BookCandidate = {
		isbn: isbns,
		cover_image: doc.cover_i
			? coverByIdUrl(doc.cover_i)
			: isbns[0]
				? coverByIsbnUrl(isbns[0])
				: null,
		publisher: doc.publisher?.[0] ?? null,
		date_published: doc.first_publish_year ? `${doc.first_publish_year}-01-01` : null,
		language: normalizeLanguage(doc.language?.[0]),
	};
	// Synopsis lives on the work record, not the search doc.
	if (doc.key) {
		const work = await fetchWork<OlWork>(doc.key);
		const desc =
			typeof work?.description === 'string' ? work.description : work?.description?.value;
		if (desc) candidate.synopsis = desc;
	}
	return candidate;
}

async function buildGbCandidateFromSearch(title: string, author: string): Promise<BookCandidate> {
	// Plain keyword search ranks better than intitle/inauthor for subtitled
	// titles ("Aftermath: Empire's End") and titles with apostrophes.
	const q = encodeURIComponent(`${title} ${author}`.trim());
	const res = await fetchVolumes<GbVolumes>(q, { maxResults: 1 });
	const info = res?.items?.[0]?.volumeInfo;
	return info ? mapGbVolumeInfo(info) : {};
}

function settled(
	ol: PromiseSettledResult<BookCandidate>,
	gb: PromiseSettledResult<BookCandidate>,
): LookupResult {
	return {
		ol: ol.status === 'fulfilled' ? ol.value : {},
		gb: gb.status === 'fulfilled' ? gb.value : {},
		fetchedAt: new Date().toISOString(),
	};
}

/**
 * Fetch Open Library + Google Books candidates for a book, in parallel. Anchors
 * on the book's ISBN when present; otherwise searches both sources by
 * title + author. Either source failing/empty still returns a result with
 * whichever succeeded.
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
	const author = book.author?.[0] ?? '';

	const [ol, gb] = probeIsbn
		? await Promise.allSettled([buildOlCandidate(probeIsbn), buildGbCandidate(probeIsbn)])
		: await Promise.allSettled([
				buildOlCandidateFromSearch(book.title, author),
				buildGbCandidateFromSearch(book.title, author),
			]);

	return { ok: true, data: settled(ol, gb) };
}

export type NewBookSearch = { isbn?: string; title?: string; author?: string };

/**
 * Look up OL + GB candidates for a book that does NOT exist yet (the "add book"
 * flow), from raw input rather than a stored row. Anchors on the ISBN when given
 * (normalized to ISBN-13), else searches by title + author. Either source
 * failing/empty still returns whichever succeeded.
 */
export async function searchForNewBook(input: NewBookSearch): Promise<Result<LookupResult>> {
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

	const [ol, gb] = isbn
		? await Promise.allSettled([buildOlCandidate(isbn), buildGbCandidate(isbn)])
		: await Promise.allSettled([
				buildOlCandidateFromSearch(title, author),
				buildGbCandidateFromSearch(title, author),
			]);

	return { ok: true, data: settled(ol, gb) };
}
