/**
 * Field selections on the admin lookup diff page, and the patch they produce.
 * A re-run lookup can leave a selection on a source that now has no value, so
 * neither the patch nor the pruned selection may treat an empty source as a
 * value: the UI never offers clearing a field (#240).
 */
import type { Database } from '../types';
import type { BookCandidate, BookPatch, LookupResult } from './types';

type BookRow = Database['public']['Tables']['books']['Row'];

export type Source = 'current' | 'ol' | 'gb';
type LookupSource = Exclude<Source, 'current'>;

export const SCALAR_FIELDS = [
	'cover_image',
	'publisher',
	'date_published',
	'language',
	'synopsis',
] as const;
export type ScalarField = (typeof SCALAR_FIELDS)[number];
export const ARRAY_FIELDS = ['format', 'isbn'] as const;
export type ArrayField = (typeof ARRAY_FIELDS)[number];
export type DiffField = ScalarField | ArrayField;

export type LookupBook = Pick<BookRow, DiffField | 'primary_isbn'>;
export type LookupSelection = Partial<Record<DiffField, Source>>;

function candidateFor(cand: LookupResult | null, source: LookupSource): BookCandidate {
	return (source === 'ol' ? cand?.ol : cand?.gb) ?? {};
}

function sourceHasValue(
	cand: LookupResult | null,
	field: DiffField,
	source: LookupSource,
): boolean {
	return Boolean(candidateFor(cand, source)[field]?.length);
}

export function scalar(
	book: LookupBook,
	cand: LookupResult | null,
	field: ScalarField,
	source: Source,
): string | null {
	if (source === 'current') return book[field] ?? null;
	return candidateFor(cand, source)[field] ?? null;
}

export function arr(
	book: LookupBook,
	cand: LookupResult | null,
	field: ArrayField,
	source: Source,
): string[] {
	if (source === 'current') return book[field] ?? [];
	return candidateFor(cand, source)[field] ?? [];
}

function fillEmptyHasValue(
	cand: LookupResult | null,
	field: DiffField,
	source: LookupSource,
): boolean {
	const v = candidateFor(cand, source)[field];
	return typeof v === 'string' ? v.trim().length > 0 : Boolean(v?.length);
}

/**
 * Fill empty's source for a field: OL when it has a value, else GB. An empty
 * list (#348) or a blank (empty or whitespace-only) string (#350) is no value,
 * so it falls through to GB.
 */
export function fillEmptySource(cand: LookupResult | null, field: DiffField): LookupSource | null {
	if (fillEmptyHasValue(cand, field, 'ol')) return 'ol';
	if (fillEmptyHasValue(cand, field, 'gb')) return 'gb';
	return null;
}

/** Bulk Fill empty's write for the scalar fields the book has empty. */
export function buildFillEmptyScalarPatch(book: LookupBook, cand: LookupResult | null): BookPatch {
	const patch: BookPatch = {};
	for (const f of SCALAR_FIELDS) {
		if (book[f] != null) continue;
		const src = fillEmptySource(cand, f);
		if (src) patch[f] = scalar(book, cand, f, src);
	}
	return patch;
}

/** Bulk Fill empty's write for the array fields the book has empty. */
export function buildFillEmptyArrayPatch(book: LookupBook, cand: LookupResult | null): BookPatch {
	const patch: BookPatch = {};
	for (const f of ARRAY_FIELDS) {
		if ((book[f]?.length ?? 0) > 0) continue;
		const src = fillEmptySource(cand, f);
		if (!src) continue;
		const v = arr(book, cand, f, src);
		patch[f] = v;
		if (f === 'isbn') {
			patch.primary_isbn =
				book.primary_isbn && v.includes(book.primary_isbn) ? book.primary_isbn : v[0];
		}
	}
	return patch;
}

/** The ISBN list and primary ISBN that the given source would leave on the book. */
export function previewIsbns(
	book: LookupBook,
	cand: LookupResult | null,
	source: Source,
	replaceIsbn: boolean,
): { isbns: string[]; primary: string | null } {
	const current = book.isbn ?? [];
	const incoming = arr(book, cand, 'isbn', source);
	const isbns =
		source === 'current'
			? current
			: replaceIsbn
				? incoming
				: [...new Set([...current, ...incoming])];
	const primary =
		book.primary_isbn && isbns.includes(book.primary_isbn) ? book.primary_isbn : (isbns[0] ?? null);
	return { isbns, primary };
}

/** The write for `selection`. Its keys are exactly what Apply counts. */
export function buildLookupPatch(
	book: LookupBook,
	cand: LookupResult | null,
	selection: LookupSelection,
	replaceIsbn: boolean,
): BookPatch {
	const patch: BookPatch = {};
	for (const f of SCALAR_FIELDS) {
		const src = selection[f] ?? 'current';
		if (src === 'current' || !sourceHasValue(cand, f, src)) continue;
		const v = scalar(book, cand, f, src);
		if (v !== (book[f] ?? null)) patch[f] = v;
	}
	const fmtSrc = selection.format ?? 'current';
	if (fmtSrc !== 'current' && sourceHasValue(cand, 'format', fmtSrc)) {
		patch.format = arr(book, cand, 'format', fmtSrc);
	}
	const isbnSrc = selection.isbn ?? 'current';
	if (isbnSrc !== 'current' && sourceHasValue(cand, 'isbn', isbnSrc)) {
		const { isbns, primary } = previewIsbns(book, cand, isbnSrc, replaceIsbn);
		patch.isbn = isbns;
		patch.primary_isbn = primary;
	}
	return patch;
}

/**
 * Drops selections whose source has no value in `cand`. `isbnDropped` tells the
 * caller to reset its Replace state, which only makes sense with an ISBN source.
 */
export function pruneLookupSelection(
	selection: LookupSelection,
	cand: LookupResult,
): { selection: LookupSelection; isbnDropped: boolean } {
	const next: LookupSelection = {};
	let isbnDropped = false;
	for (const f of [...SCALAR_FIELDS, ...ARRAY_FIELDS]) {
		const src = selection[f];
		if (!src) continue;
		if (src === 'current' || sourceHasValue(cand, f, src)) next[f] = src;
		else if (f === 'isbn') isbnDropped = true;
	}
	return { selection: next, isbnDropped };
}
