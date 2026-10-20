/**
 * `book_enrichment` row → typed `Enrichment`. The single narrowing point for the
 * `appearances` jsonb (generated as the recursive `Json` type), so app code never
 * indexes raw `Json`.
 *
 * Shape pinned against live Wookieepedia `{{App}}` templates (canon + Legends,
 * 1976–2022, NJO casts of ~900 entries). The sync (Phase 2) maps wiki params to
 * these keys: `other characters` and the `c-`/`l-` crossover variants fold into
 * their base key; markers come from the inline appearance templates listed on
 * `AppearanceMarker`.
 *
 * Tolerant by design: wiki drift or a bad write must degrade to "less enrichment",
 * never a thrown error on the detail screen. Unknown categories/markers are
 * dropped, malformed entries skipped, missing categories become `[]`.
 *
 * Deliberately independent of the generated `lib/types.ts`: the generated
 * `Tables<'book_enrichment'>['Row']` is structurally assignable to
 * `BookEnrichmentRow`.
 */

/** `{{App}}` categories, in wiki display order. Stored keys in `appearances`. */
export const APPEARANCE_CATEGORIES = [
	'dramatis_personae',
	'characters',
	'organisms',
	'droids',
	'events',
	'locations',
	'organizations',
	'species',
	'vehicles',
	'technology',
	'miscellanea',
] as const;

export type AppearanceCategory = (typeof APPEARANCE_CATEGORIES)[number];

/** Section labels as `{{App}}` renders them. */
export const APPEARANCE_CATEGORY_LABELS: Readonly<Record<AppearanceCategory, string>> = {
	dramatis_personae: 'Dramatis personae',
	characters: 'Characters',
	organisms: 'Organisms',
	droids: 'Droid models',
	events: 'Events',
	locations: 'Locations',
	organizations: 'Organizations and titles',
	species: 'Sentient species',
	vehicles: 'Vehicles and vessels',
	technology: 'Weapons and technology',
	miscellanea: 'Miscellanea',
};

/**
 * Normalized inline appearance templates. Source template in brackets.
 * An entry with no markers is a plain appearance.
 */
export const APPEARANCE_MARKERS = [
	'first', // {{1st}} First appearance
	'first_mentioned', // {{1stm}} First mentioned
	'first_canon', // {{1stc}} First canonical appearance
	'first_identified', // {{1stID|name}} First identified as <name>
	'first_before_retcon', // {{1str}} First appearance before retcon
	'mentioned', // {{Mo}} Mentioned only
	'indirect_mention', // {{Imo}} Indirect mention only
	'identified_as', // {{ID|name}} (as <name>)
	'flashback', // {{Flash}} In flashback(s)
	'hologram', // {{Hologram}} Appears in hologram
	'vision', // {{Vision|to}} Vision (to <whom>)
	'voice', // {{Voice}} Voice only
	'ghost', // {{Ghost}} Appears as a ghost or spirit
	'picture', // {{Po}} Picture only
	'cover', // {{Co}} Cover only
	'wreckage', // {{Wreck}} Wreckage only
	'retcon', // {{Ret}} Retcon
] as const;

export type AppearanceMarker = (typeof APPEARANCE_MARKERS)[number];

/** Markers meaning the subject is referenced but does not appear on the page. */
const MENTION_MARKERS: ReadonlySet<AppearanceMarker> = new Set([
	'mentioned',
	'indirect_mention',
	'first_mentioned',
]);

export type AppearanceEntry = {
	/** Display label (the wikilink label, else target). */
	readonly name: string;
	/** Wiki link target, e.g. `Mitth'raw'nuruodo/Legends`. */
	readonly page: string | null;
	readonly markers: readonly AppearanceMarker[];
	/** Free text: `{{C|…}}` comments, alias, `{{ID}}`/`{{Vision}}` arguments, or a
	 *  dramatis personae role ("Jedi Knight (female Twi'lek)"). */
	readonly note: string | null;
	/** List nesting (0 = top level), e.g. Battle of Endor under Galactic Civil War. */
	readonly depth: number;
};

export type Appearances = Readonly<Record<AppearanceCategory, readonly AppearanceEntry[]>>;

/** Columns `parseEnrichment` reads. `appearances` is `Json` in the generated types. */
export type BookEnrichmentRow = {
	readonly book_id: string;
	readonly source_pageid: number;
	readonly source_title: string | null;
	readonly source_url: string;
	readonly source_revision_id: number | null;
	readonly license: string;
	readonly attribution: string | null;
	readonly fetched_at: string;
	readonly timeline_notes: string | null;
	readonly appearances: unknown;
};

export type Enrichment = {
	readonly book_id: string;
	readonly source_pageid: number;
	readonly source_title: string | null;
	readonly source_url: string;
	readonly source_revision_id: number | null;
	readonly license: string;
	readonly attribution: string | null;
	readonly fetched_at: string;
	readonly timeline_notes: string | null;
	readonly appearances: Appearances;
};

const MARKER_SET: ReadonlySet<string> = new Set(APPEARANCE_MARKERS);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

function parseMarkers(value: unknown): AppearanceMarker[] {
	if (!Array.isArray(value)) return [];
	const out: AppearanceMarker[] = [];
	for (const m of value) {
		if (typeof m === 'string' && MARKER_SET.has(m) && !out.includes(m as AppearanceMarker)) {
			out.push(m as AppearanceMarker);
		}
	}
	return out;
}

function parseDepth(value: unknown): number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

/** One stored entry → `AppearanceEntry`, or null when it has no usable name.
 *  A bare string is accepted as a name-only entry. */
function parseEntry(value: unknown): AppearanceEntry | null {
	if (typeof value === 'string') {
		const name = nonEmptyString(value);
		return name ? { name, page: null, markers: [], note: null, depth: 0 } : null;
	}
	if (!isRecord(value)) return null;
	const name = nonEmptyString(value.name);
	if (!name) return null;
	return {
		name,
		page: nonEmptyString(value.page),
		markers: parseMarkers(value.markers),
		note: nonEmptyString(value.note),
		depth: parseDepth(value.depth),
	};
}

/** Narrow the `appearances` jsonb. Every category key is present in the result. */
export function parseAppearances(value: unknown): Appearances {
	const source = isRecord(value) ? value : {};
	const out = {} as Record<AppearanceCategory, AppearanceEntry[]>;
	for (const category of APPEARANCE_CATEGORIES) {
		const raw = source[category];
		const entries: AppearanceEntry[] = [];
		if (Array.isArray(raw)) {
			for (const item of raw) {
				const entry = parseEntry(item);
				if (entry) entries.push(entry);
			}
		}
		out[category] = entries;
	}
	return out;
}

/** Narrow a `book_enrichment` row. Never throws on malformed `appearances`. */
export function parseEnrichment(row: BookEnrichmentRow): Enrichment {
	return {
		book_id: row.book_id,
		source_pageid: row.source_pageid,
		source_title: row.source_title,
		source_url: row.source_url,
		source_revision_id: row.source_revision_id,
		license: row.license,
		attribution: row.attribution,
		fetched_at: row.fetched_at,
		timeline_notes: nonEmptyString(row.timeline_notes),
		appearances: parseAppearances(row.appearances),
	};
}

/** True when the entry is referenced but does not appear ("mentioned" vs "appears"). */
export function isMentionOnly(entry: AppearanceEntry): boolean {
	return entry.markers.some((m) => MENTION_MARKERS.has(m));
}
