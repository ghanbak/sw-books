/**
 * Wikitext → structured fields. This is the ONLY module that touches raw
 * wikitext; `derive.ts` consumes the honest `InfoboxFields` record (un-parsed
 * values, keyed by infobox parameter name) plus the page metadata.
 *
 * ISBN normalization is deliberately NOT reimplemented here — it reuses the
 * validated `normalizeIsbn` in `lib/isbn.ts` (10→13 + check-digit validation,
 * idempotent on 13, rejects invalid), re-exported so the parse surface the plan
 * describes stays intact.
 */
import { parseDate } from '../catalog';
import type { RawPage } from './client';

export { normalizeIsbn } from '../isbn';

/** Raw, un-parsed infobox parameter values keyed by lowercased parameter name. */
export type InfoboxFields = Record<string, string>;

/** A page reduced to what `deriveBook` needs — no raw wikitext escapes here. */
export type ParsedBook = {
	readonly source_pageid: number;
	/** Page title, cleaned of a trailing disambiguation parenthetical. */
	readonly title: string;
	/** `pageimages` reference URL (may be null). */
	readonly coverImageUrl: string | null;
	readonly infobox: InfoboxFields;
};

/** Remove `<ref>…</ref>` and self-closing `<ref …/>`, INCLUDING the nested
 *  citation-template content inside the ref. */
function dropRefs(s: string): string {
	return s.replace(/<ref\b[^>]*\/>/gi, '').replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '');
}

/**
 * Remove balanced `{{…}}` templates innermost-first, so NESTED citation
 * templates inside a field value — `{{SW}}`, `{{Twitter}}`, `{{Blog}}`,
 * `{{SWYouTube}}`, `{{Cite…}}`, `{{C|Part 1}}`, `{{Flash}}` — are fully stripped,
 * not just a single outer template. The loop bound caps nesting depth.
 */
function dropTemplates(input: string): string {
	let s = input;
	for (let i = 0; i < 8 && s.includes('{{'); i++) {
		s = s.replace(/\{\{[^{}]*\}\}/g, '');
	}
	return s;
}

/**
 * Remove citations (refs + nested templates) from a RAW field value while
 * PRESERVING structural separators (`<br>`, newlines, `*`/`#`/`;` bullets). The
 * multi-value splitter in `derive.ts` calls this BEFORE it splits, because a
 * citation's inner text routinely contains the very delimiters the splitter uses
 * (`#StarWars`, `&#124;`, `;`) — splitting first shatters a `{{SW}}`/`{{Twitter}}`
 * across pieces, leaving an unbalanced `{{…` that leaks as `Author{{Twitter|…}}`.
 */
export function stripCitations(raw: string): string {
	return dropTemplates(dropRefs(raw));
}

/**
 * Strip wiki markup to plain text: drop `<ref>…</ref>` (and self-closing refs)
 * with their contents, unwrap `[[target|label]]`→label and `[[target]]`→target,
 * remove remaining (incl. nested) templates/HTML/bold-italic, decode a few
 * entities, and collapse whitespace.
 */
export function stripWikiMarkup(raw: string): string {
	// <ref>…</ref> (+ nested citation content) first.
	let s = dropRefs(raw);
	// <br>, <br/> → space; other HTML tags → removed.
	s = s.replace(/<br\s*\/?>/gi, ' ');
	s = s.replace(/<[^>]+>/g, '');
	// [[target|label]] → label ; [[target]] → target.
	s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1');
	// Remaining {{templates}}, nested-aware (refs already gone).
	s = dropTemplates(s);
	// Bold/italic apostrophe markup.
	s = s.replace(/'{2,}/g, '');
	// A couple of common entities.
	s = s
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&ndash;/g, '–');
	// Leftover list bullets / stray brackets.
	s = s.replace(/^[*#:;]+/gm, ' ');
	return s.replace(/\s+/g, ' ').trim();
}

/**
 * Parse a wiki date like `[[April 11]], [[2017]]` → `2017-04-11`. Strips markup
 * first, then defers to the catalog's `parseDate` (the same formatter the seed
 * uses). Returns null when unparseable.
 */
export function parseWikiDate(raw: string): string | null {
	const text = stripWikiMarkup(raw);
	if (!text) return null;
	// Drop a leading "c."/"circa" qualifier occasionally present on release dates.
	const cleaned = text.replace(/^\s*(?:c\.|circa)\s*/i, '').trim();
	return parseDate(cleaned);
}

/** How precise a wiki release date is. `parseWikiDate` pads a partial date to
 *  the 1st ("February 1996" → 1996-02-01), so callers need this to avoid
 *  treating the padding as a real day. */
export type DatePrecision = 'day' | 'month' | 'year';

const MONTH =
	/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

/** Precision of a raw infobox date value, or null when it has no year. */
export function wikiDatePrecision(raw: string): DatePrecision | null {
	const text = stripWikiMarkup(raw).replace(/^\s*(?:c\.|circa)\s*/i, '');
	if (/\b\d{4}-\d{2}-\d{2}\b/.test(text)) return 'day';
	if (!/\b\d{4}\b/.test(text)) return null;
	if (!MONTH.test(text)) return 'year';
	// A day is a 1–2 digit number (optionally ordinal) that is not the year.
	return /(?:^|[^\d])\d{1,2}(?:st|nd|rd|th)?(?:[^\d]|$)/i.test(text.replace(/\b\d{4}\b/g, ''))
		? 'day'
		: 'month';
}

/**
 * Whether a page is marked canceled (never published) — Wookieepedia tags these
 * with `{{Canceled|novels}}` (also the `{{Cancelled}}` spelling). Ignores the
 * text inside `<nowiki>` / comments so a mention can't trip it.
 */
export function isCanceledPage(wikitext: string): boolean {
	const text = wikitext.replace(/<!--[\s\S]*?-->/g, '').replace(/<nowiki>[\s\S]*?<\/nowiki>/gi, '');
	return /\{\{\s*cancell?ed\s*(?:\||\}\})/i.test(text);
}

/** One parsed timeline token: the signed year plus its era. */
type TimelineToken = { readonly year: number; readonly era: 'BBY' | 'ABY' };

/**
 * Match every timeline token in a stripped value. A token is a start number
 * (optionally the LEFT side of a `X–Y` dash range, since the era attaches to the
 * whole range — `67-65 BBY` means "67 to 65 BBY", start 67), followed by an era.
 * The number may carry thousands commas (`25,793 BBY`). The era, not any stray
 * range dash, determines the sign — so a leading `-` is never read as negative.
 */
const TIMELINE_TOKEN = /(\d[\d,]*(?:\.\d+)?)(?:\s*[-–—]\s*\d[\d,]*(?:\.\d+)?)?\s*(BBY|ABY)/gi;

/**
 * Parse an in-universe timeline value to a signed year matching the app's
 * `timeline_order` convention (BBY → negative, ABY → positive).
 *
 * Bugs this fixes vs. the naive "first `-?\d+ BBY`" match:
 *   1. Sign — the sign comes ONLY from BBY/ABY. A range dash (`67-65 BBY`) is no
 *      longer misread as a negative magnitude (which flipped Darth Plagueis to
 *      +65 instead of -67).
 *   2. Commas — thousands separators are kept, so `25,793 BBY` → -25793, not -793.
 *   3. Range / flashback selection — timelines are noisy and human-reviewed, so
 *      the heuristic is deliberately simple: when tokens span BOTH eras, ancient
 *      BBY values are almost always flashbacks, so the primary setting is the
 *      first ABY token (the frame story) — fixes Crosscurrent (41 ABY, not
 *      -5000) and Millennium Falcon (43 ABY, not -60). Otherwise take the first
 *      token: the start of the book's span (Darth Plagueis → -67).
 *
 * Returns null when no `<number> BBY|ABY` token is present.
 */
export function parseTimeline(raw: string): number | null {
	const text = stripWikiMarkup(raw);
	if (!text) return null;
	const tokens: TimelineToken[] = [];
	for (const m of text.matchAll(TIMELINE_TOKEN)) {
		const magnitude = Number.parseFloat((m[1] ?? '').replace(/,/g, ''));
		if (Number.isNaN(magnitude)) continue;
		const era = (m[2] ?? '').toUpperCase() as 'BBY' | 'ABY';
		tokens.push({ year: era === 'BBY' ? -magnitude : magnitude, era });
	}
	if (tokens.length === 0) return null;
	// Mixed eras → ancient-BBY flashback + ABY frame: take the first ABY token.
	const firstAby = tokens.find((t) => t.era === 'ABY');
	if (firstAby && tokens.some((t) => t.era === 'BBY')) return firstAby.year;
	return (tokens[0] as TimelineToken).year;
}

/** Walk a balanced `{{Book … }}` template out of the wikitext (brace-aware). */
function extractBookTemplate(wikitext: string): string | null {
	const open = wikitext.match(/\{\{\s*Book\s*(?=[|}\n])/i);
	if (!open || open.index === undefined) return null;
	const start = open.index + 2; // past the opening `{{`
	let brace = 1;
	let bracket = 0;
	let i = start;
	while (i < wikitext.length) {
		const two = wikitext.slice(i, i + 2);
		if (two === '{{') {
			brace++;
			i += 2;
			continue;
		}
		if (two === '}}') {
			brace--;
			i += 2;
			if (brace === 0) return wikitext.slice(start, i - 2);
			continue;
		}
		if (two === '[[') {
			bracket++;
			i += 2;
			continue;
		}
		if (two === ']]') {
			if (bracket > 0) bracket--;
			i += 2;
			continue;
		}
		i++;
	}
	return null; // unbalanced — treat as no infobox
}

/** Split template body on top-level `|` (ignoring `|` inside `{{}}`/`[[]]`). */
function splitTopLevelFields(body: string): string[] {
	const parts: string[] = [];
	let brace = 0;
	let bracket = 0;
	let buf = '';
	for (let i = 0; i < body.length; i++) {
		const two = body.slice(i, i + 2);
		if (two === '{{') {
			brace++;
			buf += two;
			i++;
			continue;
		}
		if (two === '}}') {
			if (brace > 0) brace--;
			buf += two;
			i++;
			continue;
		}
		if (two === '[[') {
			bracket++;
			buf += two;
			i++;
			continue;
		}
		if (two === ']]') {
			if (bracket > 0) bracket--;
			buf += two;
			i++;
			continue;
		}
		const c = body[i] ?? '';
		if (c === '|' && brace === 0 && bracket === 0) {
			parts.push(buf);
			buf = '';
			continue;
		}
		buf += c;
	}
	parts.push(buf);
	return parts;
}

/**
 * Parse the `{{Book}}` infobox into raw field values. Returns null when the page
 * has no `{{Book}}` template (disambiguation pages, reference works, etc.).
 */
export function parseBookInfobox(wikitext: string): InfoboxFields | null {
	const body = extractBookTemplate(wikitext);
	if (body === null) return null;
	const fields: InfoboxFields = {};
	const parts = splitTopLevelFields(body);
	// parts[0] is the template name ("Book\n…") — skip it.
	for (const part of parts.slice(1)) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		const key = part.slice(0, eq).trim().toLowerCase();
		const value = part.slice(eq + 1).trim();
		if (key) fields[key] = value;
	}
	return fields;
}

/** Strip a trailing disambiguation parenthetical from a page title. */
export function cleanTitle(title: string): string {
	return title.replace(/\s*\((?:novel|novelization|novella|short story|book)\)\s*$/i, '').trim();
}

/** Reduce a fetched page to `ParsedBook`, or null when it has no `{{Book}}`. */
export function parseBook(page: RawPage): ParsedBook | null {
	const infobox = parseBookInfobox(page.wikitext);
	if (!infobox) return null;
	return {
		source_pageid: page.pageid,
		title: cleanTitle(page.title),
		coverImageUrl: page.imageUrl,
		infobox,
	};
}
