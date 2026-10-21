/**
 * Display helpers for the book-enrichment UI (Timeline card, Characters card +
 * sheet, Wookieepedia card). Pure, RN-free, so every rule here is unit-tested.
 */
import { type AppearanceEntry, type Appearances, isMentionOnly } from './enrichment';

// --- Timeline -------------------------------------------------------------------

export type TimelineSegment = {
	/** e.g. `67–65 BBY` (en dash between numbers). */
	readonly range: string;
	/** Trailing `(…)` group, first letter capitalized, e.g. `Part 1`. */
	readonly label: string | null;
};

/** Split on `sep` only at parenthesis depth 0 (`25 ABY (Part 1; prologue)` stays whole). */
function splitTopLevel(s: string, sep: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === '(') depth++;
		else if (ch === ')') depth = Math.max(0, depth - 1);
		else if (ch === sep && depth === 0) {
			out.push(s.slice(start, i));
			start = i + 1;
		}
	}
	out.push(s.slice(start));
	return out;
}

/** Index of the `(` matching a trailing `)`, or -1 when the segment doesn't end in a group. */
function trailingGroupStart(s: string): number {
	if (!s.endsWith(')')) return -1;
	let depth = 0;
	for (let i = s.length - 1; i >= 0; i--) {
		if (s[i] === ')') depth++;
		else if (s[i] === '(') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** ASCII hyphen between numbers (optionally after an era suffix) → en dash. */
function enDashRanges(s: string): string {
	return s.replace(/(\d(?:\s*[AB]BY)?)\s*-\s*(?=\d)/g, '$1–');
}

/** `timeline_notes` → one segment per `;`-separated part (depth 0 only). */
export function parseTimeline(notes: string | null | undefined): TimelineSegment[] {
	if (!notes) return [];
	const segments: TimelineSegment[] = [];
	for (const raw of splitTopLevel(notes, ';')) {
		const seg = raw.trim();
		if (!seg) continue;
		const open = trailingGroupStart(seg);
		const before = open > 0 ? seg.slice(0, open).trim() : '';
		if (open > 0 && before) {
			const inner = seg.slice(open + 1, -1).trim();
			segments.push({ range: enDashRanges(before), label: inner ? capitalize(inner) : null });
		} else {
			segments.push({ range: enDashRanges(seg), label: null });
		}
	}
	return segments;
}

function spokenRange(range: string): string {
	return range.replace(/\s*–\s*/g, ' to ').replace(/\bc\.\s*/g, 'circa ');
}

/** VoiceOver label for the Timeline card body, e.g. `67 to 65 BBY, Part 1; 54 to 52 BBY, Part 2`. */
export function timelineAccessibilityLabel(segments: readonly TimelineSegment[]): string {
	return segments
		.map((s) => (s.label ? `${spokenRange(s.range)}, ${s.label}` : spokenRange(s.range)))
		.join('; ');
}

// --- Provenance -----------------------------------------------------------------

/** Dramatis personae role → sentence case (`chief of state …` → `Chief of state …`). */
export function formatRole(note: string | null): string | null {
	if (!note) return null;
	return capitalize(note);
}

/** Stored SPDX-ish id → display form: `CC-BY-SA-3.0` → `CC BY-SA 3.0`. */
export function formatLicense(license: string): string {
	const m = /^CC-([A-Z]+(?:-[A-Z]+)*)-(\d+(?:\.\d+)*)$/i.exec(license.trim());
	return m ? `CC ${m[1]} ${m[2]}` : license;
}

export const DEFAULT_ATTRIBUTION = 'Wookieepedia contributors';

/** `From Wookieepedia contributors · CC BY-SA 3.0`. */
export function formatAttributionLine(attribution: string | null, license: string): string {
	return `From ${attribution ?? DEFAULT_ATTRIBUTION} · ${formatLicense(license)}`;
}

// --- Characters -----------------------------------------------------------------

export type CharacterSection = 'cast' | 'other';

/** One character as the UI renders it. */
export type CharacterItem = {
	/** Stable across searches: section + index in the stored list. */
	readonly key: string;
	readonly name: string;
	/** Cast: role in sentence case. Others: verbatim (aliases like `"Quiet"`). */
	readonly note: string | null;
	/** Wiki link target; null = not pressable. */
	readonly page: string | null;
	readonly mentioned: boolean;
};

export type CharacterListRow =
	| {
			readonly type: 'header';
			readonly key: string;
			readonly section: CharacterSection;
			readonly title: string;
			readonly count: number;
	  }
	| {
			readonly type: 'entry';
			readonly key: string;
			readonly section: CharacterSection;
			readonly item: CharacterItem;
	  }
	| { readonly type: 'section-end'; readonly key: string; readonly section: CharacterSection }
	| { readonly type: 'gap'; readonly key: string };

export const CHARACTER_SECTION_TITLES: Readonly<Record<CharacterSection, string>> = {
	cast: 'Main cast',
	other: 'Other characters',
};

function identity(entry: AppearanceEntry): string {
	return entry.page ?? entry.name;
}

function toItem(entry: AppearanceEntry, section: CharacterSection, index: number): CharacterItem {
	return {
		key: `${section}:${index}`,
		name: entry.name,
		note: section === 'cast' ? formatRole(entry.note) : entry.note,
		page: entry.page,
		mentioned: isMentionOnly(entry),
	};
}

/** Cast and other characters as items, wiki order; others deduped against the cast. */
export function characterItems(appearances: Appearances): {
	cast: CharacterItem[];
	other: CharacterItem[];
} {
	const castIds = new Set(appearances.dramatis_personae.map(identity));
	const cast = appearances.dramatis_personae.map((e, i) => toItem(e, 'cast', i));
	const other: CharacterItem[] = [];
	appearances.characters.forEach((e, i) => {
		if (!castIds.has(identity(e))) other.push(toItem(e, 'other', i));
	});
	return { cast, other };
}

/** Lowercase, strip diacritics (NFD + combining marks), trim. */
export function normalizeSearch(s: string): string {
	let out = '';
	for (const ch of s.normalize('NFD')) {
		const code = ch.charCodeAt(0);
		// Combining Diacritical Marks block (U+0300–U+036F).
		if (code < 0x300 || code > 0x36f) out += ch;
	}
	return out.toLowerCase().trim();
}

/** Case- and diacritic-insensitive match on name + note. Empty query matches all. */
export function matchesCharacter(item: CharacterItem, query: string): boolean {
	const q = normalizeSearch(query);
	if (!q) return true;
	return (
		normalizeSearch(item.name).includes(q) ||
		(item.note !== null && normalizeSearch(item.note).includes(q))
	);
}

/** The detail card's preview: first `limit` cast entries, and whether the sheet holds more. */
export function castPreview(
	appearances: Appearances,
	limit = 5,
): { items: CharacterItem[]; hasMore: boolean } {
	const { cast, other } = characterItems(appearances);
	return { items: cast.slice(0, limit), hasMore: cast.length > limit || other.length > 0 };
}

/**
 * Flat FlashList rows for the Characters sheet: a header + entries + section end per
 * non-empty section, a gap between sections. With a query, sections without hits are
 * dropped and header counts show matches.
 *
 * `total` is every row in the sheet (unfiltered; the subtitle). `castCount` /
 * `otherCount` are the shown (filtered) counts.
 */
export function buildCharacterRows(
	appearances: Appearances,
	query: string,
): { rows: CharacterListRow[]; total: number; castCount: number; otherCount: number } {
	const { cast, other } = characterItems(appearances);
	const sections: [CharacterSection, CharacterItem[]][] = [
		['cast', cast.filter((c) => matchesCharacter(c, query))],
		['other', other.filter((c) => matchesCharacter(c, query))],
	];
	const rows: CharacterListRow[] = [];
	for (const [section, items] of sections) {
		if (items.length === 0) continue;
		if (rows.length > 0) rows.push({ type: 'gap', key: `gap:${section}` });
		rows.push({
			type: 'header',
			key: `header:${section}`,
			section,
			title: CHARACTER_SECTION_TITLES[section],
			count: items.length,
		});
		for (const item of items) rows.push({ type: 'entry', key: item.key, section, item });
		rows.push({ type: 'section-end', key: `end:${section}`, section });
	}
	return {
		rows,
		total: cast.length + other.length,
		castCount: sections[0][1].length,
		otherCount: sections[1][1].length,
	};
}

/** `{name}[, mentioned only][, {note}]`. */
export function characterAccessibilityLabel(
	item: Pick<CharacterItem, 'name' | 'note' | 'mentioned'>,
): string {
	const parts = [item.name];
	if (item.mentioned) parts.push('mentioned only');
	if (item.note) parts.push(item.note);
	return parts.join(', ');
}
