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

/** GET /search.json?title=…&author=…&limit=N — work search. */
export function searchByTitleAuthor<T = unknown>(
	title: string,
	author: string,
	limit = 10,
): Promise<T | null> {
	const t = encodeURIComponent(title);
	const a = encodeURIComponent(author);
	return fetchJson<T>(`${BASE}/search.json?title=${t}&author=${a}&limit=${limit}`);
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
