/**
 * Pure core of the unified scan view (#106): the captured-books list that feeds the
 * tray, barcode resolution against the in-memory catalog, and which screen state the
 * scan host shows. Type-only imports keep it testable in the node vitest env.
 */
import type { Book } from '@/lib/hooks';
import { normalizeIsbn } from '@/lib/isbn';
import type { SpineMatch } from '@/lib/spine-match';

/**
 * Prepend `incoming` to `captured`, newest first (index 0 = tray left), deduped by
 * book id. A book already captured keeps its position. Returns `captured` itself when
 * nothing is new, so a repeat match doesn't re-render the tray.
 */
export function prependCaptured(captured: Book[], incoming: Book[]): Book[] {
	const seen = new Set(captured.map((b) => b.id));
	const fresh: Book[] = [];
	for (const book of incoming) {
		if (seen.has(book.id)) continue;
		seen.add(book.id);
		fresh.push(book);
	}
	return fresh.length === 0 ? captured : [...fresh, ...captured];
}

/** Live-tray candidates from an OCR match pass: only confident matches go in the tray. */
export function highConfidenceBooks(matches: SpineMatch[]): Book[] {
	return matches.filter((m) => m.bucket === 'high').map((m) => m.book);
}

/**
 * The review draft's matches at Finish. The tray is what the user saw, so every tray
 * book reaches review as a certain match, in tray order, even if the final pooled
 * match pass dropped it or rated it low (barcodes never pass through the matcher).
 * The matcher's remaining matches follow.
 */
export function mergeCapturedIntoMatches(matches: SpineMatch[], captured: Book[]): SpineMatch[] {
	if (captured.length === 0) return matches;
	const trayIds = new Set(captured.map((b) => b.id));
	const certain: SpineMatch[] = captured.map((book) => ({
		book,
		score: 1,
		margin: 1,
		bucket: 'high',
		supports: 1,
		alternates: matches.find((m) => m.book.id === book.id)?.alternates ?? [],
	}));
	return [...certain, ...matches.filter((m) => !trayIds.has(m.book.id))];
}

/** ISBN-13 → book, for barcode lookups without a network round-trip. */
export function buildIsbnIndex(books: Book[]): ReadonlyMap<string, Book> {
	const index = new Map<string, Book>();
	for (const book of books) {
		for (const raw of book.isbn ?? []) {
			const isbn = normalizeIsbn(raw);
			if (isbn && !index.has(isbn)) index.set(isbn, book);
		}
	}
	return index;
}

export type BarcodeOutcome =
	| { type: 'added'; book: Book }
	| { type: 'duplicate'; book: Book }
	| { type: 'not_star_wars'; isbn: string }
	| { type: 'invalid' };

/** Resolve a scanned barcode against the catalog and the current tray. */
export function resolveBarcode(
	raw: string,
	index: ReadonlyMap<string, Book>,
	captured: Book[],
): BarcodeOutcome {
	const isbn = normalizeIsbn(raw);
	if (!isbn) return { type: 'invalid' };
	const book = index.get(isbn);
	if (!book) return { type: 'not_star_wars', isbn };
	return captured.some((b) => b.id === book.id)
		? { type: 'duplicate', book }
		: { type: 'added', book };
}

/** Repeat frames of the same code within this window are ignored. */
export const BARCODE_REPEAT_MS = 2000;

/** The camera reports a code every frame it's in view — only act on it once per window. */
export function isRepeatBarcode(
	last: { data: string; at: number } | null,
	data: string,
	now: number,
	windowMs = BARCODE_REPEAT_MS,
): boolean {
	return last !== null && last.data === data && now - last.at <= windowMs;
}

export type ScanViewState =
	| 'checking_permission'
	| 'permission_prompt'
	| 'permission_denied'
	| 'catalog_loading'
	| 'catalog_error'
	| 'scanning';

/**
 * The scan host's screen. Camera permission gates everything; then the catalog must
 * be in memory, since both spine matching and barcode lookup run against it.
 */
export function selectScanViewState({
	permission,
	catalogReady,
	catalogError,
}: {
	permission: { granted: boolean; canAskAgain: boolean } | null;
	catalogReady: boolean;
	catalogError: string | null;
}): ScanViewState {
	if (!permission) return 'checking_permission';
	if (!permission.granted)
		return permission.canAskAgain ? 'permission_prompt' : 'permission_denied';
	if (catalogReady) return 'scanning';
	return catalogError ? 'catalog_error' : 'catalog_loading';
}

/** Finish button label: what the tray holds, not how many photos were taken. */
export function finishCapturedLabel(bookCount: number): string {
	return `Finish scanning, ${bookCount} ${bookCount === 1 ? 'book' : 'books'} captured`;
}
