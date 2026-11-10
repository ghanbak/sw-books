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
 *
 * Apostrophes are deleted rather than treated as breaks ("Razor's" → "razors"), and a
 * run of two or more single-letter tokens is merged ("a c crispin" → "ac crispin"). A
 * lone letter stays, so "i jedi" and "x wing" keep their word break.
 */
export function normalizeQuery(s: string): string {
	return collapsePunctuation(normalizeSearch(s).replace(/['‘’ʼ]/g, '')).replace(
		/\b[a-z](?: [a-z]\b)+/g,
		(run) => run.replace(/ /g, ''),
	);
}

function collapsePunctuation(s: string): string {
	return s.replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Every non-alphanumeric is a word break and letters stay separate: "Paul S. K" → "paul s k". */
function literalForm(s: string): string {
	return collapsePunctuation(normalizeSearch(s));
}

/**
 * Books matching the query across title / author / series / slug. Empty query → [].
 *
 * A field matches on either form: `normalizeQuery` finds "razors edge" and "ac crispin",
 * and `literalForm` keeps "galaxy s edge" and the mid-typing "paul s k", which merging
 * or deleting the apostrophe would otherwise lose.
 */
export function searchBooks(books: Book[], query: string): Book[] {
	const q = normalizeQuery(query);
	if (!q) return [];
	const literal = literalForm(query);
	const matches = (field: string) =>
		normalizeQuery(field).includes(q) || literalForm(field).includes(literal);
	return books.filter(
		(b) =>
			matches(b.title) ||
			b.author.some(matches) ||
			(b.series_name ? matches(b.series_name) : false) ||
			matches(b.slug),
	);
}

const MAX_SWAP_CANDIDATES = 12;

/** Catalog results for the shelf-scan Swap sheet: `searchBooks` minus books already in the queue. */
export function swapCandidates(
	books: Book[],
	query: string,
	takenIds: ReadonlySet<string>,
): Book[] {
	return searchBooks(books, query)
		.filter((b) => !takenIds.has(b.id))
		.slice(0, MAX_SWAP_CANDIDATES);
}
