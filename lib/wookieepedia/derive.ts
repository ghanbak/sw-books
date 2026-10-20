/**
 * `ParsedBook` + crawl bucket → `DiscoveredBook` (a catalog row shape plus the
 * source pageid). Two provenances meet here: infobox *facts* (author, publisher,
 * dates, ISBNs, timeline) and the crawl *bucket* (`canon`/`type`), kept as a
 * seam so each is auditable on its own.
 *
 * `DiscoveredBook` reuses `BookFields` from `lib/catalog.ts` so the discovery
 * CSV columns and any later promotion payload share one type and break
 * compilation together if the schema shifts.
 */
import type { BookFields } from '../catalog';
import { slugify } from '../slug';
import type { BookType, CategoryBucket } from './categories';
import {
	type ParsedBook,
	normalizeIsbn,
	parseTimeline,
	parseWikiDate,
	stripCitations,
	stripWikiMarkup,
} from './parse';

export type { BookType } from './categories';

/** A catalog-shaped row discovered from Wookieepedia, anchored by `source_pageid`. */
export type DiscoveredBook = BookFields & { source_pageid: number };

/** Infobox parameter keys that hold a release date, in preference order. */
const DATE_KEYS = ['release date', 'publication date', 'published', 'first published'] as const;
/** Infobox keys that may hold ISBNs (the `{{Book}}` template uses isbn/isbn2/isbn3). */
const ISBN_KEYS = ['isbn', 'isbn2', 'isbn3', 'isbn4'] as const;

/**
 * Split a multi-value infobox value (co-authors, media-type list) on the
 * structural delimiters wiki editors use — `<br>`, newlines, `*`/`#` bullets,
 * `;`, ` & ` (e.g. `Michael Reaves & Maya Kaathryn Bohnhoff`), and ` and ` —
 * then reduce each piece to plain text. Order preserved; caller sorts.
 *
 * Citations (refs + nested templates) are stripped FIRST via `stripCitations`,
 * because a `{{SW}}`/`{{Twitter}}` citation's inner text contains the very
 * delimiters below (`#`, `;`, `&#124;`); splitting first would shatter it and
 * leak markup like `Claudia Gray{{Twitter|…}}` as an author. The ` & ` split
 * requires surrounding whitespace so it never breaks a `&ndash;`/`&amp;` entity.
 */
function splitInfoboxList(raw: string): string[] {
	return stripCitations(raw)
		.split(/<br\s*\/?>|\r?\n|[*#;]|\s+&\s+|(?:,\s*and\s+)|(?:\s+and\s+)/i)
		.map((piece) => stripWikiMarkup(piece))
		.filter(Boolean);
}

function firstPresent(infobox: Record<string, string>, keys: readonly string[]): string | null {
	for (const key of keys) {
		const value = infobox[key];
		if (value?.trim()) return value;
	}
	return null;
}

const FORMAT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
	[/hard\s*cover|hardback|hardcover/i, 'Hardcover'],
	[/paperback|softcover|soft\s*cover|mass\s*market|trade/i, 'Paperback'],
	[/e-?book|digital/i, 'eBook'],
	[/audio/i, 'Audiobook'],
];

function normalizeFormatToken(token: string): string | null {
	for (const [re, canonical] of FORMAT_RULES) if (re.test(token)) return canonical;
	return null;
}

/** C-locale (code-unit) comparison, for deterministic multi-value ordering. */
function byCodeUnit(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function deriveFormats(infobox: Record<string, string>): string[] | null {
	const tokens = new Set<string>();
	const mediaType = infobox['media type'] ?? infobox.format ?? '';
	for (const piece of splitInfoboxList(mediaType)) {
		const f = normalizeFormatToken(piece);
		if (f) tokens.add(f);
	}
	// An `audiobook` parameter link implies an audiobook edition exists.
	if ((infobox.audiobook ?? '').trim()) tokens.add('Audiobook');
	if (tokens.size === 0) return null;
	return [...tokens].sort(byCodeUnit);
}

function deriveAuthors(infobox: Record<string, string>): string[] {
	const authors = splitInfoboxList(infobox.author ?? '');
	const unique = [...new Set(authors)];
	return unique.sort(byCodeUnit);
}

function deriveIsbns(infobox: Record<string, string>): string[] {
	const out = new Set<string>();
	for (const key of ISBN_KEYS) {
		const raw = infobox[key];
		if (!raw) continue;
		for (const piece of splitInfoboxList(raw)) {
			const normalized = normalizeIsbn(piece);
			if (normalized) out.add(normalized);
		}
	}
	return [...out].sort(byCodeUnit);
}

function cleanScalar(raw: string | null): string | null {
	if (!raw) return null;
	const text = stripWikiMarkup(raw);
	return text || null;
}

/** Assemble one catalog-shaped discovery row from parsed facts + crawl bucket. */
export function deriveBook(parsed: ParsedBook, bucket: CategoryBucket): DiscoveredBook {
	const isbn = deriveIsbns(parsed.infobox);
	const type: BookType | '' = bucket.type ?? ''; // Legends type resolved at promotion.
	return {
		title: parsed.title,
		slug: slugify(parsed.title),
		author: deriveAuthors(parsed.infobox),
		cover_image: parsed.coverImageUrl,
		canon: bucket.canon,
		date_published: parseWikiDate(firstPresent(parsed.infobox, DATE_KEYS) ?? ''),
		format: deriveFormats(parsed.infobox),
		isbn,
		primary_isbn: isbn[0] ?? null,
		language: 'English',
		publisher: cleanScalar(parsed.infobox.publisher ?? null),
		series_name: cleanScalar(parsed.infobox.series ?? null),
		series_order: null,
		timeline_order: parseTimeline(parsed.infobox.timeline ?? ''),
		synopsis: null,
		type,
		era: null,
		source_pageid: parsed.source_pageid,
	};
}
