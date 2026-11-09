import type { Book } from '@/lib/hooks';
import { normalizeSearch } from './wookieepedia/enrichment-display';

/**
 * Catalog search, extracted from the old Archives inline search so the Search tab
 * owns it. Pure (no React/Supabase) — unit-tested in the node vitest env.
 */

/**
 * Normalize for fuzzy matching: fold diacritics (NFD, strip combining marks), lowercase,
 * collapse any run of non-alphanumerics to a single space, trim. So "I, Jedi" and the
 * slug "i-jedi" both match a query of "i jedi", and "jose" matches "José". Letters NFD
 * does not decompose (ø, ł, æ) are not folded and still act as word breaks.
 */
export function normalizeQuery(s: string): string {
	return normalizeSearch(s)
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** Books matching the query across title / author / series / slug. Empty query → []. */
export function searchBooks(books: Book[], query: string): Book[] {
	const q = normalizeQuery(query);
	if (!q) return [];
	return books.filter(
		(b) =>
			normalizeQuery(b.title).includes(q) ||
			b.author.some((a) => normalizeQuery(a).includes(q)) ||
			(b.series_name ? normalizeQuery(b.series_name).includes(q) : false) ||
			normalizeQuery(b.slug).includes(q),
	);
}
