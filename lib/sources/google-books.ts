/**
 * Google Books fetcher. The `q` parameter is passed through verbatim — callers
 * build and encode their own query expressions (e.g. `isbn:9780…`,
 * `intitle:…+inauthor:…`) so URLs stay byte-identical to the legacy pipeline.
 *
 * `fields` requests a partial response (https://developers.google.com/books/docs/v1/performance);
 * omit it to receive the full payload.
 */
import { fetchJson } from './fetch-retry';

const BASE = 'https://www.googleapis.com/books/v1/volumes';

export type GoogleBooksOptions = {
	maxResults?: number;
	fields?: string;
};

export function fetchVolumes<T = unknown>(
	q: string,
	options: GoogleBooksOptions = {},
): Promise<T | null> {
	const maxResults = options.maxResults ?? 5;
	const fields = options.fields ? `&fields=${encodeURIComponent(options.fields)}` : '';
	return fetchJson<T>(`${BASE}?q=${q}&maxResults=${maxResults}${fields}`);
}
