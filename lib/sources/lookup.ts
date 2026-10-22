/**
 * Open Library + Google Books candidate lookup — the logic behind the admin's
 * "add book" / "look up" flows, extracted from the Next.js server action
 * (admin/app/_actions/lookup.ts) so CLI scripts can reuse it. No auth and no
 * DB here: callers gate access themselves.
 *
 * Also exposes the audience signals (GB `categories`, OL work `subjects`) that
 * the discovery changeset uses to resolve a Legends book's `type`.
 */
import { isEnglishIsbn, toIsbn13 } from '../isbn';
import { fetchVolumes } from './google-books';
import {
	coverByIdUrl,
	coverByIsbnUrl,
	fetchByIsbn,
	fetchEditionsByWork,
	fetchWork,
	searchByTitleAuthor,
} from './open-library';
import type { BookCandidate, LookupResult } from './types';

// --- response shapes (only the fields we read) ---
type OlEdition = {
	title?: string;
	full_title?: string;
	subtitle?: string;
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
		title?: string;
		author_name?: string[];
		cover_i?: number;
		isbn?: string[];
		publisher?: string[];
		first_publish_year?: number;
		language?: string[];
		subject?: string[];
	}>;
};

type OlWork = { title?: string; description?: string | { value?: string }; subjects?: string[] };

type GbVolumeInfo = {
	title?: string;
	subtitle?: string;
	authors?: string[];
	categories?: string[];
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
export async function buildOlCandidate(isbn: string): Promise<BookCandidate> {
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

export async function buildGbCandidate(isbn: string): Promise<BookCandidate> {
	const res = await fetchVolumes<GbVolumes>(`isbn:${isbn}`, { maxResults: 1 });
	const info = res?.items?.[0]?.volumeInfo;
	return info ? mapGbVolumeInfo(info, [isbn]) : {};
}

// --- title/author builders (used when the book has no ISBN) ---
export async function buildOlCandidateFromSearch(
	title: string,
	author: string,
): Promise<BookCandidate> {
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

export async function buildGbCandidateFromSearch(
	title: string,
	author: string,
): Promise<BookCandidate> {
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
 * Fetch OL + GB candidates in parallel. Anchors on `isbn` (already ISBN-13)
 * when given, else searches both sources by title + author. Either source
 * failing/empty still returns whichever succeeded.
 */
export async function lookupCandidatesFor(input: {
	isbn: string | null;
	title: string;
	author: string;
}): Promise<LookupResult> {
	const [ol, gb] = input.isbn
		? await Promise.allSettled([buildOlCandidate(input.isbn), buildGbCandidate(input.isbn)])
		: await Promise.allSettled([
				buildOlCandidateFromSearch(input.title, input.author),
				buildGbCandidateFromSearch(input.title, input.author),
			]);
	return settled(ol, gb);
}

/** The ISBN-13s a Google Books volume lists (ISBN-10s converted). */
export function gbVolumeIsbns(info: {
	industryIdentifiers?: Array<{ type: string; identifier: string }>;
}): string[] {
	const out = new Set<string>();
	for (const id of info.industryIdentifiers ?? []) {
		const n = toIsbn13(id.identifier);
		if (n) out.add(n);
	}
	return [...out];
}

/**
 * Google Books' `isbn:` index misses volumes its keyword search finds. Search
 * by title + author and keep the first hit whose OWN identifiers include one of
 * `isbns` — identity stays ISBN-anchored, so a same-titled book can't slip in.
 */
export async function findGbVolumeByTitleWithIsbn(input: {
	isbns: readonly string[];
	title: string;
	author: string;
}): Promise<{ isbn: string; volumeId: string; cover_image: string | null } | null> {
	const q = encodeURIComponent(`${input.title} ${input.author}`.trim());
	const res = await fetchVolumes<{
		items?: Array<{ id?: string; volumeInfo?: GbVolumeInfo }>;
	}>(q, { maxResults: 10 });
	for (const item of res?.items ?? []) {
		const info = item.volumeInfo;
		if (!info || !item.id) continue;
		const isbn = gbVolumeIsbns(info).find((i) => input.isbns.includes(i));
		if (!isbn) continue;
		return { isbn, volumeId: item.id, cover_image: mapGbVolumeInfo(info).cover_image ?? null };
	}
	return null;
}

// --- Audience signals (for resolving `type`) ---------------------------------

/**
 * One source's audience evidence for a book: the record it hit (title +
 * authors, so a caller can verify a search hit is the right book) and its raw
 * audience labels (GB BISAC `categories`, or OL work `subjects`).
 */
export type AudienceSignal = {
	readonly source: 'google-books' | 'open-library';
	/** `isbn` = anchored on a known ISBN (identity certain); `search` = title+author hit. */
	readonly via: 'isbn' | 'search';
	readonly matchedTitle: string;
	readonly matchedAuthors: readonly string[];
	readonly labels: readonly string[];
};

function gbSignal(info: GbVolumeInfo, via: AudienceSignal['via']): AudienceSignal | null {
	if (!info.categories?.length) return null;
	return {
		source: 'google-books',
		via,
		matchedTitle: [info.title, info.subtitle].filter(Boolean).join(': '),
		matchedAuthors: info.authors ?? [],
		labels: info.categories,
	};
}

/**
 * Collect raw audience signals for a book from OL + GB. ISBN-anchored first
 * (the OL edition's work `subjects`, GB `isbn:` categories); when an ISBN
 * yields nothing — or there is no ISBN — fall back to title+author searches,
 * whose hits carry their title/authors so the caller can reject a wrong hit.
 * Never throws; a failed source just contributes no signal.
 */
export async function fetchAudienceSignals(input: {
	isbns: readonly string[];
	title: string;
	author: string;
}): Promise<AudienceSignal[]> {
	const out: AudienceSignal[] = [];

	for (const isbn of input.isbns) {
		const edition = await fetchByIsbn<OlEdition>(isbn);
		const workKey = edition?.works?.[0]?.key;
		if (workKey) {
			const work = await fetchWork<OlWork>(workKey);
			if (work?.subjects?.length) {
				out.push({
					source: 'open-library',
					via: 'isbn',
					matchedTitle: edition?.full_title ?? edition?.title ?? work.title ?? '',
					matchedAuthors: [],
					labels: work.subjects,
				});
			}
		}
		const gb = await fetchVolumes<GbVolumes>(`isbn:${isbn}`, { maxResults: 1 });
		const info = gb?.items?.[0]?.volumeInfo;
		const sig = info ? gbSignal(info, 'isbn') : null;
		if (sig) out.push(sig);
		if (out.length) break; // first ISBN with evidence is enough
	}

	if (!out.some((s) => s.source === 'google-books')) {
		const q = encodeURIComponent(`${input.title} ${input.author}`.trim());
		const gb = await fetchVolumes<GbVolumes>(q, { maxResults: 3 });
		for (const item of gb?.items ?? []) {
			const sig = item.volumeInfo ? gbSignal(item.volumeInfo, 'search') : null;
			if (sig) out.push(sig);
		}
	}
	if (!out.some((s) => s.source === 'open-library')) {
		const search = await searchByTitleAuthor<OlSearch>(input.title, input.author, {
			limit: 3,
			fields: 'key,title,author_name,subject',
		});
		for (const doc of search?.docs ?? []) {
			if (!doc.subject?.length) continue;
			out.push({
				source: 'open-library',
				via: 'search',
				matchedTitle: doc.title ?? '',
				matchedAuthors: doc.author_name ?? [],
				labels: doc.subject,
			});
		}
	}
	return out;
}
