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

/**
 * Spoken text for the catalog filter's `role="status"` count (#356): "4 of 185 books",
 * "All 185 books", "No books match", or with a sidebar filter "4 books match Missing ISBN".
 */
export function filterStatusLabel(shown: number, total: number, activeLabel: string): string {
	if (activeLabel) {
		if (shown === 0) return `No books match ${activeLabel}`;
		return shown === 1 ? `1 book matches ${activeLabel}` : `${shown} books match ${activeLabel}`;
	}
	if (shown === 0) return 'No books match';
	if (shown === total) return `All ${total} books`;
	return `${shown} of ${total} books`;
}

/**
 * Row to focus after `removedId` leaves the table (#387): the next row in visible
 * (sorted, filtered) order, else the previous one, else null (focus the filter input).
 * An id not in `rowIds` also gives null.
 */
export function focusTargetAfterRemove(
	rowIds: readonly string[],
	removedId: string,
): string | null {
	const i = rowIds.indexOf(removedId);
	if (i === -1) return null;
	return rowIds[i + 1] ?? rowIds[i - 1] ?? null;
}
