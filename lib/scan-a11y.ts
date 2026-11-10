/**
 * Screen-reader strings for the scanner (barcode + shelf). Pure so the pluralization
 * and state suffixes unit-test in the node vitest env; the components only wire them
 * to `accessibilityLabel` / `announce()`. None of these are rendered as visible text.
 */

function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** Counter badge + per-capture announcement. */
export function photosCapturedLabel(count: number): string {
	return `${plural(count, 'photo', 'photos')} captured`;
}

/** Shelf HUD Finish button. */
export function finishScanLabel(count: number): string {
	return `Finish scanning, ${plural(count, 'photo', 'photos')} taken`;
}

/** Review footer add button. Matches the visible "Nothing selected" when empty. */
export function addToOwnedLabel(count: number): string {
	return count === 0 ? 'Nothing selected' : `Add ${plural(count, 'book', 'books')} to Owned`;
}

/**
 * Review row / grid tile checkbox. Owned rows say so; `low`-bucket matches carry the
 * "double-check" cue the grid shows only as a `?` badge (and the list only as a section
 * header, which a swipe-through can skip past).
 */
export function reviewMatchLabel({
	title,
	authors,
	owned,
	lowConfidence,
}: {
	title: string;
	authors: string[];
	owned: boolean;
	lowConfidence: boolean;
}): string {
	let label = authors.length > 0 ? `${title} by ${authors.join(', ')}` : title;
	if (owned) label += ', already owned';
	else if (lowConfidence) label += ', double-check this match';
	return label;
}

/** Swap-sheet candidate row. */
export function swapCandidateLabel({
	title,
	authors,
	owned,
}: {
	title: string;
	authors: string[];
	owned: boolean;
}): string {
	let label = `Swap to ${title}`;
	if (authors.length > 0) label += ` by ${authors.join(', ')}`;
	if (owned) label += ', already owned';
	return label;
}

export type BarcodeResultKind = 'found' | 'not_found' | 'invalid' | 'error';

/** Spoken when a barcode lookup settles (the result swaps in silently over the camera). */
export function barcodeResultAnnouncement(kind: BarcodeResultKind, bookTitle?: string): string {
	switch (kind) {
		case 'found':
			return bookTitle ? `Found ${bookTitle}` : 'Book found';
		case 'not_found':
			return 'Not in the Archive';
		case 'invalid':
			return 'Invalid barcode';
		case 'error':
			return 'Lookup failed. Check your connection and try again.';
	}
}

/**
 * Wrapper props for a decorative cover inside a labelled row/tile: taps fall through to
 * the row, and VoiceOver/TalkBack skip the cover instead of announcing a nameless extra
 * element (the row's own label already names the book).
 */
export const hiddenDecorationProps = {
	pointerEvents: 'none',
	accessibilityElementsHidden: true,
	importantForAccessibility: 'no-hide-descendants',
} as const;
