import type { Book } from '@/lib/hooks';
import { type CatalogSort, sortBooks } from '@/lib/sort';

/**
 * The Archives tab's filter pills. Pure (no React/Supabase) so it unit-tests in the node
 * vitest env. Each filter is one field on `ArchiveFilters` plus one predicate in
 * `matchesArchiveFilters`; all predicates AND together. To add a filter (e.g. series),
 * add its field, its default, and its predicate.
 */
export type CanonFilter = 'all' | 'Canon' | 'Legends';
export type TypeFilter = 'all' | 'adult' | 'ya' | 'middle_grade';

export type ArchiveFilters = {
	canon: CanonFilter;
	type: TypeFilter;
};

export const DEFAULT_ARCHIVE_FILTERS: ArchiveFilters = { canon: 'all', type: 'all' };

/** Catalog `books.type` value for each type pill. Types not listed here appear only under All. */
export const ARCHIVE_TYPE_VALUES: Record<Exclude<TypeFilter, 'all'>, string> = {
	adult: 'Adult Novel',
	ya: 'YA Novel',
	middle_grade: 'Middle Grade Novel',
};

type ArchiveFilterOption<K extends string> = { key: K; label: string; accessibilityLabel: string };

export const ARCHIVE_CANON_OPTIONS: ArchiveFilterOption<CanonFilter>[] = [
	{ key: 'all', label: 'All', accessibilityLabel: 'All continuities' },
	{ key: 'Canon', label: 'Canon', accessibilityLabel: 'Canon' },
	{ key: 'Legends', label: 'Legends', accessibilityLabel: 'Legends' },
];

export const ARCHIVE_TYPE_OPTIONS: ArchiveFilterOption<TypeFilter>[] = [
	{ key: 'all', label: 'All', accessibilityLabel: 'All types' },
	{ key: 'adult', label: 'Adult', accessibilityLabel: 'Adult novels' },
	{ key: 'ya', label: 'YA', accessibilityLabel: 'Young adult novels' },
	{ key: 'middle_grade', label: 'Middle Grade', accessibilityLabel: 'Middle grade novels' },
];

/** True if the book passes every active Archives filter. */
export function matchesArchiveFilters(book: Book, filters: ArchiveFilters): boolean {
	if (filters.canon !== 'all' && book.canon !== filters.canon) return false;
	if (filters.type !== 'all' && book.type !== ARCHIVE_TYPE_VALUES[filters.type]) return false;
	return true;
}

/** The Archives list: filtered, then sorted. Never mutates `books`. */
export function filterArchiveBooks(
	books: Book[],
	filters: ArchiveFilters,
	sort: CatalogSort,
): Book[] {
	return sortBooks(
		books.filter((b) => matchesArchiveFilters(b, filters)),
		sort,
	);
}
