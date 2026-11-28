/**
 * Pure read-side filter for scripts/isbn-cache.json.
 *
 * An entry is served on a warm run only when it was written by the current
 * schema AND every cached edition ISBN is a checksum-valid, English-language
 * (978-0 / 978-1) ISBN-13. Anything else is dropped so the row is re-fetched
 * through `normalizeSourcedIsbn` + `isEnglishIsbn`.
 */
import { isEnglishIsbn, isValidIsbn13 } from '../../lib/isbn';
import type { EditionRecord } from './pick-primary-isbn';

// v10: #459 added checksum validation at fetch time. v9 entries could hold
// ISBN-13s converted from bad-check ISBN-10s, which look valid on read, so
// they are discarded wholesale rather than re-validated.
export const CACHE_SCHEMA_VERSION = 10;

export type CacheEntry = {
	schema_version: typeof CACHE_SCHEMA_VERSION;
	fetched_at: string;
	current_isbn: string;
	ol_work_id: string | null;
	editions: EditionRecord[];
	source: 'ol' | 'google-books' | 'none';
	// True when the CSV ISBN's OL metadata named a different book — we
	// substituted via title-search and the CSV ISBN should be discarded.
	csv_isbn_rejected: boolean;
	// What OL said the CSV ISBN actually was, for the report.
	csv_isbn_ol_title: string | null;
};

export type CacheReadResult = {
	entries: Record<string, CacheEntry>;
	/** Entries from another schema version (or malformed). */
	stale: number;
	/** Current-schema entries holding an edition ISBN that fails the checksum. */
	invalidIsbn: number;
	/**
	 * Current-schema entries holding a non-English edition (e.g. 979-10/11/12),
	 * written before #467 when the script let any 979-0x/1x prefix through.
	 */
	nonEnglishIsbn: number;
};

export function filterCacheEntries(
	raw: Record<string, Partial<CacheEntry> | null | undefined>,
): CacheReadResult {
	const entries: Record<string, CacheEntry> = {};
	let stale = 0;
	let invalidIsbn = 0;
	let nonEnglishIsbn = 0;
	for (const [slug, entry] of Object.entries(raw)) {
		if (entry?.schema_version !== CACHE_SCHEMA_VERSION || !Array.isArray(entry.editions)) {
			stale++;
			continue;
		}
		if (!entry.editions.every((e) => typeof e?.isbn === 'string' && isValidIsbn13(e.isbn))) {
			invalidIsbn++;
			continue;
		}
		if (!entry.editions.every((e) => isEnglishIsbn(e.isbn))) {
			nonEnglishIsbn++;
			continue;
		}
		entries[slug] = entry as CacheEntry;
	}
	return { entries, stale, invalidIsbn, nonEnglishIsbn };
}
