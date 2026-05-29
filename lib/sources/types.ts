import type { Database } from '../types';

type BookRow = Database['public']['Tables']['books']['Row'];

/**
 * Fields the admin tool may patch on a book. Derived from the generated row so
 * the catalog schema stays the single source of truth.
 */
export type BookPatch = Partial<
	Pick<
		BookRow,
		| 'isbn'
		| 'primary_isbn'
		| 'cover_image'
		| 'publisher'
		| 'date_published'
		| 'language'
		| 'format'
		| 'synopsis'
		| 'title'
		| 'author'
		| 'canon'
		| 'era'
		| 'type'
		| 'series_name'
		| 'series_order'
		| 'timeline_order'
	>
>;

/**
 * A candidate edition returned by an external source (Open Library, Google
 * Books). Picked from BookPatch — not BookRow — so the two can never diverge.
 */
export type BookCandidate = Pick<
	BookPatch,
	| 'isbn'
	| 'primary_isbn'
	| 'cover_image'
	| 'publisher'
	| 'date_published'
	| 'language'
	| 'format'
	| 'synopsis'
>;

export type LookupResult = {
	ol: BookCandidate;
	gb: BookCandidate;
	fetchedAt: string;
};
