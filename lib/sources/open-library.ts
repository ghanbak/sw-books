/**
 * Open Library fetchers. Thin wrappers over the OL REST endpoints that return
 * parsed JSON (or null on any failure). Callers own the response shapes and
 * the mapping to edition records.
 *
 * URLs are kept byte-identical to the legacy pipeline so cached/repeat runs
 * produce identical output.
 */
import { fetchJson } from './fetch-retry';

const BASE = 'https://openlibrary.org';
const COVERS_BASE = 'https://covers.openlibrary.org';

/** GET /isbn/{isbn}.json — edition metadata for a single ISBN. */
export function fetchByIsbn<T = unknown>(isbn: string): Promise<T | null> {
	return fetchJson<T>(`${BASE}/isbn/${isbn}.json`);
}

/** GET {workKey}/editions.json?limit=N — all editions of a work. */
export function fetchEditionsByWork<T = unknown>(workKey: string, limit = 100): Promise<T | null> {
	return fetchJson<T>(`${BASE}${workKey}/editions.json?limit=${limit}`);
}

/** GET {workKey}.json — work record (description, subjects, …). */
export function fetchWork<T = unknown>(workKey: string): Promise<T | null> {
	return fetchJson<T>(`${BASE}${workKey}.json`);
}

/** GET {authorKey}.json — author record (`name`, …). */
export function fetchAuthor<T = unknown>(authorKey: string): Promise<T | null> {
	return fetchJson<T>(`${BASE}${authorKey}.json`);
}

/**
 * GET /search.json?title=…&author=…&limit=N — work search. `search.json`
 * returns a trimmed default field set; pass `fields` (e.g.
 * `key,cover_i,isbn,publisher,first_publish_year,language`) to get the rest.
 */
export function searchByTitleAuthor<T = unknown>(
	title: string,
	author: string,
	options: { limit?: number; fields?: string } = {},
): Promise<T | null> {
	const t = encodeURIComponent(title);
	const a = encodeURIComponent(author);
	const limit = options.limit ?? 10;
	const fields = options.fields ? `&fields=${encodeURIComponent(options.fields)}` : '';
	return fetchJson<T>(`${BASE}/search.json?title=${t}&author=${a}&limit=${limit}${fields}`);
}

/** GET /api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data — cover + metadata. */
export function fetchBooksData<T = unknown>(isbn: string): Promise<T | null> {
	return fetchJson<T>(`${BASE}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
}

/** Cover image URL anchored to an OL cover id. */
export function coverByIdUrl(coverId: number, size: 'S' | 'M' | 'L' = 'L'): string {
	return `${COVERS_BASE}/b/id/${coverId}-${size}.jpg`;
}

/** Cover image URL anchored to an ISBN; `default=false` 404s instead of serving a blank. */
export function coverByIsbnUrl(isbn: string, size: 'S' | 'M' | 'L' = 'L'): string {
	return `${COVERS_BASE}/b/isbn/${isbn}-${size}.jpg?default=false`;
}
