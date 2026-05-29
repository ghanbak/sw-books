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
	// Keyless access has ~0 daily quota; an API key (GOOGLE_BOOKS_API_KEY) lifts
	// it. Optional — without it we still try keyless and degrade gracefully.
	const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
	const key = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
	return fetchJson<T>(`${BASE}?q=${q}&maxResults=${maxResults}${fields}${key}`);
}
