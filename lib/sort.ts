import type { Book } from '@/lib/hooks';

export type SortField = 'timeline_order' | 'date_published';
export type SortDirection = 'asc' | 'desc';
export type CatalogSort = { field: SortField; direction: SortDirection };

export const DEFAULT_SORT: CatalogSort = { field: 'timeline_order', direction: 'asc' };

const MONTHS: Record<string, number> = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

/**
 * Parses a `date_published` value into a sortable YYYYMMDD integer.
 *
 * The catalog stores ISO dates ("1976-11-12"); we also accept the human format
 * ("January 5, 2021") that appears in the source CSV, so the sort is correct regardless of
 * which representation a row holds. Parsing is deterministic rather than via Date.parse:
 * Date.parse of non-ISO strings is implementation-defined, and Hermes (this app's engine)
 * can return NaN, which would silently sink every book to the end and alphabetize the list.
 * Returns null for null/blank/unrecognized values — those sort to the end.
 */
export function parsePublishDate(value: string | null): number | null {
	if (!value) return null;
	const s = value.trim();
	// ISO 8601 date: YYYY-MM-DD (the canonical stored format; tolerates a time suffix).
	const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) return Number(iso[1]) * 10000 + Number(iso[2]) * 100 + Number(iso[3]);
	// Fallback: human format "Month D, YYYY".
	const m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
	if (!m) return null;
	const month = MONTHS[m[1].toLowerCase()];
	if (month === undefined) return null;
	return Number(m[3]) * 10000 + month * 100 + Number(m[2]);
}

/**
 * Returns a new array of books sorted by the given field and direction. Never mutates the
 * input (the catalog array is owned by BooksProvider's context). Books with a null or
 * unparseable sort key always sink to the end, regardless of direction.
 */
export function sortBooks(books: Book[], sort: CatalogSort): Book[] {
	const dir = sort.direction === 'asc' ? 1 : -1;
	const key = (b: Book): number | null =>
		sort.field === 'timeline_order' ? b.timeline_order : parsePublishDate(b.date_published);

	return [...books].sort((a, b) => {
		const ka = key(a);
		const kb = key(b);
		if (ka == null && kb == null) return a.title.localeCompare(b.title);
		if (ka == null) return 1;
		if (kb == null) return -1;
		if (ka !== kb) return (ka - kb) * dir;
		// Tiebreaker is always title-ascending, regardless of sort direction — intentional.
		return a.title.localeCompare(b.title);
	});
}

/**
 * Parses a persisted sort value, falling back to DEFAULT_SORT for null, malformed JSON, or
 * any out-of-union field/direction. Pure and exported so persistence edge cases are testable
 * without React.
 */
export function parseStoredSort(raw: string | null): CatalogSort {
	if (!raw) return DEFAULT_SORT;
	try {
		const v = JSON.parse(raw);
		const fieldOk = v?.field === 'timeline_order' || v?.field === 'date_published';
		const dirOk = v?.direction === 'asc' || v?.direction === 'desc';
		return fieldOk && dirOk ? { field: v.field, direction: v.direction } : DEFAULT_SORT;
	} catch {
		return DEFAULT_SORT;
	}
}
