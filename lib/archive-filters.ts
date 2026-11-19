import type { Book } from '@/lib/hooks';
import { type CatalogSort, sortBooks } from '@/lib/sort';

/**
 * The Archives tab's filter pills. Pure (no React/Supabase) so it unit-tests in the node
 * vitest env. Each filter is one field on `ArchiveFilters` plus one predicate in
 * `matchesArchiveFilters`; all predicates AND together. To add a filter, add its field, its
 * default, and its predicate.
 */
export type CanonFilter = 'all' | 'Canon' | 'Legends';
export type TypeFilter = 'all' | 'adult' | 'ya' | 'middle_grade';

export type ArchiveFilters = {
	canon: CanonFilter;
	type: TypeFilter;
	/** Active series (trimmed `series_name`); null/absent = no series filter. Overrides the sort. */
	series?: string | null;
};

/** One row of the series picker: a distinct series and how many books it would show. */
export type SeriesOption = { name: string; count: number };

/** The book's series name, trimmed; null when it has none (null, empty, or blank). */
function seriesOf(book: Book): string | null {
	const name = book.series_name?.trim();
	return name ? name : null;
}

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
	if (filters.series != null && seriesOf(book) !== filters.series) return false;
	return true;
}

/** Reading order within a series: `series_order` ascending, unnumbered last, ties by title. */
function sortBySeriesOrder(books: Book[]): Book[] {
	return [...books].sort((a, b) => {
		const oa = a.series_order;
		const ob = b.series_order;
		if (oa != null && ob != null && oa !== ob) return oa - ob;
		if (oa == null && ob != null) return 1;
		if (oa != null && ob == null) return -1;
		return a.title.localeCompare(b.title);
	});
}

/**
 * The Archives list: filtered, then sorted. While a series is active the list is in reading
 * order (`series_order`) and `sort` is ignored; clearing the series uses `sort` again.
 * Never mutates `books`.
 */
export function filterArchiveBooks(
	books: Book[],
	filters: ArchiveFilters,
	sort: CatalogSort,
): Book[] {
	const matching = books.filter((b) => matchesArchiveFilters(b, filters));
	return filters.series != null ? sortBySeriesOrder(matching) : sortBooks(matching, sort);
}

/**
 * The series picker's rows: each distinct series among books passing the canon and type
 * filters (the active series itself is ignored), with its count, sorted by name. Counts match
 * what picking the series would show; series with no matching books are left out, and books
 * without a series are never counted.
 */
export function buildSeriesOptions(books: Book[], filters: ArchiveFilters): SeriesOption[] {
	const scope: ArchiveFilters = { ...filters, series: null };
	const counts = new Map<string, number>();
	for (const book of books) {
		const name = seriesOf(book);
		if (name && matchesArchiveFilters(book, scope)) counts.set(name, (counts.get(name) ?? 0) + 1);
	}
	return [...counts]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
