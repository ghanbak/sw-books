/**
 * Pure selection logic for the buy-button / share-link "primary" ISBN.
 *
 * Priority: paperback variants first (cheapest, most common Amazon hit), then
 * hardcover, then anything else. Within a format, newer publish_date wins; ISBN
 * lexical order is the deterministic tiebreaker.
 */

export type BookFormat =
	| 'paperback'
	| 'hardcover'
	| 'mass market paperback'
	| 'trade paperback'
	| 'ebook'
	| 'audiobook'
	| 'library binding';

export type EditionSource = 'ol' | 'google-books';

export type EditionRecord = {
	isbn: string;
	format: BookFormat | null;
	publish_date: string | null;
	cover_url: string | null;
	source: EditionSource;
};

const PHYSICAL_PRIORITY: readonly BookFormat[] = [
	'paperback',
	'trade paperback',
	'mass market paperback',
	'hardcover',
] as const;

const NON_PHYSICAL_PRIORITY: readonly BookFormat[] = ['ebook', 'audiobook', 'library binding'] as const;

const FORMAT_PRIORITY: readonly BookFormat[] = [...PHYSICAL_PRIORITY, ...NON_PHYSICAL_PRIORITY];

function bestByFormat(
	editions: readonly EditionRecord[],
	priority: readonly BookFormat[],
): string | null {
	for (const fmt of priority) {
		const matches = editions.filter((e) => e.format === fmt);
		if (matches.length === 0) continue;
		const sorted = [...matches].sort(
			(a, b) =>
				(b.publish_date ?? '').localeCompare(a.publish_date ?? '') || a.isbn.localeCompare(b.isbn),
		);
		return sorted[0].isbn;
	}
	return null;
}

export function pickPrimaryIsbn(
	editions: readonly EditionRecord[],
	preferredIsbn?: string | null,
): string | null {
	if (editions.length === 0) return null;
	// 1. A physical-print edition (paperback/hardcover) always wins.
	const physical = bestByFormat(editions, PHYSICAL_PRIORITY);
	if (physical) return physical;
	// 2. No physical print: honour CSV's curated ISBN when it survives.
	if (preferredIsbn && editions.some((e) => e.isbn === preferredIsbn)) return preferredIsbn;
	// 3. Otherwise fall back to ebook/audio/library-binding in that order.
	const nonPhysical = bestByFormat(editions, NON_PHYSICAL_PRIORITY);
	if (nonPhysical) return nonPhysical;
	// 4. Nothing tagged. Take the first edition.
	return editions[0].isbn;
}

export function pickPrimaryEdition(
	editions: readonly EditionRecord[],
	preferredIsbn?: string | null,
): EditionRecord | null {
	const isbn = pickPrimaryIsbn(editions, preferredIsbn);
	if (!isbn) return null;
	return editions.find((e) => e.isbn === isbn) ?? null;
}

const FORMAT_ALIAS: Record<string, BookFormat> = {
	paperback: 'paperback',
	'trade paperback': 'trade paperback',
	'mass market paperback': 'mass market paperback',
	'mass-market paperback': 'mass market paperback',
	hardcover: 'hardcover',
	hardback: 'hardcover',
	ebook: 'ebook',
	'electronic book': 'ebook',
	'electronic resource': 'ebook',
	audiobook: 'audiobook',
	'audio book': 'audiobook',
	'audio cd': 'audiobook',
	'compact disc': 'audiobook',
	'library binding': 'library binding',
};

export function normalizeFormat(raw: string | null | undefined): BookFormat | null {
	if (!raw) return null;
	const key = raw.toLowerCase().trim();
	return FORMAT_ALIAS[key] ?? null;
}

export function distinctFormats(editions: readonly EditionRecord[]): BookFormat[] {
	const set = new Set<BookFormat>();
	for (const e of editions) if (e.format) set.add(e.format);
	return [...set];
}
