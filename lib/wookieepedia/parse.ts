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

/**
 * Strip wiki markup to plain text: drop `<ref>…</ref>` (and self-closing refs)
 * with their contents, unwrap `[[target|label]]`→label and `[[target]]`→target,
 * remove remaining templates/HTML/bold-italic, decode a few entities, and
 * collapse whitespace.
 */
export function stripWikiMarkup(raw: string): string {
	let s = raw;
	// <ref>…</ref> and <ref … /> — remove tag AND nested citation content first.
	s = s.replace(/<ref\b[^>]*\/>/gi, '');
	s = s.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '');
	// <br>, <br/> → space; other HTML tags → removed.
	s = s.replace(/<br\s*\/?>/gi, ' ');
	s = s.replace(/<[^>]+>/g, '');
	// [[target|label]] → label ; [[target]] → target.
	s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1');
	// Remaining {{templates}} → drop (non-nested; refs already gone).
	for (let i = 0; i < 5 && s.includes('{{'); i++) {
		s = s.replace(/\{\{[^{}]*\}\}/g, '');
	}
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

/**
 * Parse an in-universe timeline value to a signed year matching the app's
 * `timeline_order` convention (BBY → negative, ABY → positive). Handles the
 * `c.`/`circa` qualifier and ranges (`19 BBY–18 BBY` → takes the start). Returns
 * null when no `<number> BBY|ABY` token is present.
 */
export function parseTimeline(raw: string): number | null {
	const text = stripWikiMarkup(raw);
	if (!text) return null;
	// First "<number> BBY|ABY" token wins (range start).
	const m = text.match(/(-?\d+(?:\.\d+)?)\s*(BBY|ABY)/i);
	if (!m) return null;
	const magnitude = Number.parseFloat(m[1] ?? '');
	if (Number.isNaN(magnitude)) return null;
	const era = (m[2] ?? '').toUpperCase();
	return era === 'BBY' ? -magnitude : magnitude;
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
