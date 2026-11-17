// Screen-reader names and states for the books table (#287). Pure so the root
// Vitest suite can cover them without a DOM.

/** `column.getIsSorted()` from @tanstack/react-table. */
type SortState = false | 'asc' | 'desc';

/** The `aria-sort` value for a sortable column header. */
export function ariaSortFor(sorted: SortState): 'ascending' | 'descending' | 'none' {
	if (sorted === 'asc') return 'ascending';
	if (sorted === 'desc') return 'descending';
	return 'none';
}

/** Accessible name for a row's selection checkbox. */
export function selectRowLabel(title: string): string {
	return `Select ${title}`;
}

/**
 * Accessible name for an inline-edit cell's display button: field, book and value, with
 * "empty" in place of the visual "—" (screen readers skip it at default punctuation).
 */
export function editCellLabel(
	fieldLabel: string,
	bookTitle: string,
	value: string | null | undefined,
): string {
	const shown = value?.trim() ? value : 'empty';
	return `Edit ${fieldLabel} of ${bookTitle}: ${shown}`;
}
