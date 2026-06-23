import type { Book } from '@/lib/hooks';

/**
 * Catalog search, extracted from the old Archives inline search so the Search tab
 * owns it. Pure (no React/Supabase) — unit-tested in the node vitest env.
 */

/**
 * Normalize for fuzzy matching: lowercase, collapse any run of non-alphanumerics to
 * a single space, trim. So "I, Jedi" and the slug "i-jedi" both match a query of
 * "i jedi".
 */
export function normalizeQuery(s: string): string {
	return s
		.toLowerCase()
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
