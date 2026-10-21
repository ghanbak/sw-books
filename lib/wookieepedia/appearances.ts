/**
 * Wikitext → `book_enrichment` content: the `{{App}}` appearances and the
 * `{{Book}}` infobox timeline. Pure (no network, no Node APIs) so it unit-tests
 * against real wikitext fixtures.
 *
 * Output is the STORED shape: optional entry keys (`page`, `markers`, `note`,
 * `depth`) and empty categories are omitted to keep the jsonb small.
 * `parseAppearances` (enrichment.ts) reads it back, filling the defaults.
 *
 * `{{App}}` rules (Template:App):
 * - Params `characters`, `dramatis personae`, `other characters`, `organisms`,
 *   `droids`, `events`, `locations`, `organizations`, `species`, `vehicles`,
 *   `technology`, `miscellanea`, plus `c-`/`l-` crossover variants. `c-`/`l-`
 *   fold into their base key; `other characters` folds into `characters`;
 *   `dramatis personae` (principal cast) stays separate.
 * - One entry per bullet line; `*` = depth 0, `**` = depth 1, … `{{!}}` is a
 *   column break and is ignored.
 * - An entry that starts with a wikilink is that page: name = label (else
 *   target), `page` = the (normalized) target, ALWAYS set for a linked entry —
 *   even when it equals the name — so linked vs plain text is distinguishable
 *   and the app can link names out to the wiki. Anything after the
 *   link (alias, `; role`, `/ alias`) becomes the note. An entry that does not
 *   start with a link is plain text (no `page`).
 * - Inline marker templates map to `AppearanceMarker`s; `{{C|…}}` and marker
 *   arguments (`{{ID|x}}`, `{{1stID|x}}`, `{{Vision|to}}`, …) add to the note.
 *   Unknown templates are dropped and counted in `diagnostics` (drift signal),
 *   never thrown.
 */
import {
	APPEARANCE_CATEGORIES,
	type AppearanceCategory,
	type AppearanceMarker,
} from './enrichment';
import {
	dropRefs,
	extractTemplates,
	parseBookInfobox,
	splitTopLevelFields,
	stripWikiMarkup,
} from './parse';

/** One appearance as stored in the `appearances` jsonb (empty keys omitted). */
export type StoredAppearanceEntry = {
	name: string;
	page?: string;
	markers?: AppearanceMarker[];
	note?: string;
	depth?: number;
};

/** The `appearances` jsonb: only non-empty categories, in `APPEARANCE_CATEGORIES` order. */
export type StoredAppearances = Partial<Record<AppearanceCategory, StoredAppearanceEntry[]>>;

/** What the parser saw but could not map — surfaced by the sync report, never fatal. */
export type AppearanceDiagnostics = {
	/** `{{App}}` templates found on the page (0 = no appearances section). */
	readonly appTemplates: number;
	/** Non-empty `{{App}}` params that map to no stored category. */
	readonly unknownParams: readonly string[];
	/** Unknown inline templates inside entries → occurrence count. */
	readonly unknownTemplates: Readonly<Record<string, number>>;
	/** Sub-group headings / layout HTML inside a category value (structure only; not stored). */
	readonly subheadings: number;
	/** Other non-empty, non-bullet lines (e.g. an entry missing its `*`) — drift signal. */
	readonly skippedLines: number;
	/** Bullet lines that produced no usable name. */
	readonly emptyEntries: number;
};

export type ParsedAppearances = {
	readonly appearances: StoredAppearances;
	readonly entryCount: number;
	readonly diagnostics: AppearanceDiagnostics;
};

/** Normalized `{{App}}` param (lowercase, single-spaced, `c-`/`l-` stripped) → stored key. */
const PARAM_TO_CATEGORY: Readonly<Record<string, AppearanceCategory>> = {
	'dramatis personae': 'dramatis_personae',
	characters: 'characters',
	'other characters': 'characters',
	organisms: 'organisms',
	droids: 'droids',
	events: 'events',
	locations: 'locations',
	organizations: 'organizations',
	species: 'species',
	vehicles: 'vehicles',
	technology: 'technology',
	miscellanea: 'miscellanea',
};

/** Lowercased inline template name → marker. */
const TEMPLATE_TO_MARKER: Readonly<Record<string, AppearanceMarker>> = {
	'1st': 'first',
	'1stm': 'first_mentioned',
	'1stc': 'first_canon',
	'1stid': 'first_identified',
	'1str': 'first_before_retcon',
	mo: 'mentioned',
	imo: 'indirect_mention',
	id: 'identified_as',
	flash: 'flashback',
	hologram: 'hologram',
	vision: 'vision',
	voice: 'voice',
	ghost: 'ghost',
	po: 'picture',
	co: 'cover',
	wreck: 'wreckage',
	ret: 'retcon',
	'1stcm': 'first_canon_mentioned',
	'1stp': 'first_pictured',
	'1stdesc': 'first_described',
	ho: 'heard',
	corpse: 'corpse',
	unborn: 'unborn',
	sim: 'simulation',
	holocron: 'holocron',
	qo: 'quote',
	// "Mentioned only; in the opening crawl" — a mention, with the crawl as the note.
	crawl: 'mentioned',
};

/** Fixed note text a marker template implies (beyond its marker). */
const TEMPLATE_NOTE: Readonly<Record<string, string>> = { crawl: 'opening crawl' };

/** Citation templates that may sit inside an entry: dropped silently, not drift. */
const IGNORED_TEMPLATES: ReadonlySet<string> = new Set(['storycite']);

/**
 * Markers whose first argument is publication metadata ("simultaneous with
 * *Scorched*"), not an in-universe fact — the argument is not kept as a note.
 */
const ARGLESS_MARKERS: ReadonlySet<AppearanceMarker> = new Set([
	'first',
	'first_mentioned',
	'first_canon',
	'first_before_retcon',
	'first_canon_mentioned',
	'first_pictured',
	'first_described',
]);

/** A bold/italic sub-group heading ("'''Food and beverages'''") or a layout-only HTML line. */
const SUBHEADING_LINE = /^\s*(?:'{2,}.*'{2,}:?|(?:<\/?[a-z][^>]*>\s*)+)\s*$/i;

/** Link namespaces that are never an appearance subject. */
const NON_SUBJECT_LINK = /^:?\s*(?:file|image|category|media)\s*:/i;

const INNERMOST_TEMPLATE = /\{\{([^{}]*)\}\}/g;
const MAX_TEMPLATE_NESTING = 8;

function dropComments(s: string): string {
	return s.replace(/<!--[\s\S]*?-->/g, '');
}

/** Leaf templates that render as literal text (`{{'s}}` → `'s`, `{{!}}` → column break). */
function expandLiteralTemplates(s: string): string {
	return s
		.replace(/\{\{\s*'s\s*\}\}/g, "'s")
		.replace(/\{\{\s*!\s*\}\}/g, '')
		.replace(/\{\{\s*=\s*\}\}/g, '=');
}

function collapse(s: string): string {
	return s.replace(/\s+/g, ' ').trim();
}

/** Normalize a param name: lowercase, `_`/whitespace runs → one space, `c-`/`l-` dropped. */
function normalizeParam(key: string): string {
	return collapse(key.toLowerCase().replace(/_/g, ' ')).replace(/^[cl]-\s*/, '');
}

/** Template name + positional args of an innermost template body (named args dropped). */
function splitTemplate(body: string): { name: string; args: string[] } {
	const [rawName = '', ...rest] = splitTopLevelFields(body);
	const args = rest.filter((a) => !/^\s*[\w ]+\s*=/.test(a)).map((a) => a.trim());
	return { name: collapse(rawName).toLowerCase(), args };
}

/** MediaWiki page-name normalization: `_` → space, single spaces, first letter upper. */
function normalizeTarget(target: string): string {
	const t = collapse(target.replace(/_/g, ' ').replace(/^:/, ''))
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
	return t.charAt(0).toUpperCase() + t.slice(1);
}

type LineResult = { entry: StoredAppearanceEntry | null };

type Tally = {
	unknownTemplates: Map<string, number>;
};

/**
 * Pull marker/comment templates out of an entry's text (innermost first, so a
 * template nested in `{{C|…}}` is resolved before its parent). Returns the text
 * with templates removed plus the collected markers and note fragments.
 */
function takeTemplates(
	text: string,
	tally: Tally,
): { rest: string; markers: AppearanceMarker[]; notes: string[] } {
	const markers: AppearanceMarker[] = [];
	const notes: string[] = [];
	let s = text;
	for (let i = 0; i < MAX_TEMPLATE_NESTING && s.includes('{{'); i++) {
		s = s.replace(INNERMOST_TEMPLATE, (_m, body: string) => {
			const { name, args } = splitTemplate(body);
			const arg = args[0] ? stripWikiMarkup(args[0]) : '';
			if (name === 'c') {
				if (arg) notes.push(arg);
				return '';
			}
			const marker = TEMPLATE_TO_MARKER[name];
			if (marker) {
				if (!markers.includes(marker)) markers.push(marker);
				const fixed = TEMPLATE_NOTE[name];
				if (fixed) notes.push(fixed);
				if (arg && !ARGLESS_MARKERS.has(marker)) notes.push(arg);
				return '';
			}
			if (IGNORED_TEMPLATES.has(name)) return '';
			tally.unknownTemplates.set(name, (tally.unknownTemplates.get(name) ?? 0) + 1);
			return '';
		});
	}
	return { rest: s, markers, notes };
}

/**
 * Leading wikilink of `text` (after whitespace), or null. Keeps its link trail
 * (`[[droid]]s`) and, for quoted phrases in miscellanea (`"[[Clanker]]"`), the
 * surrounding quotes — both are part of the displayed name.
 */
function leadingLink(
	text: string,
): { target: string; label: string | null; after: string; wrap: [string, string] } | null {
	const m = text.match(/^\s*(["']?)\[\[([^[\]|]*)(?:\|([^[\]]*))?\]\]([a-z]*)/);
	if (!m) return null;
	const target = m[2] ?? '';
	if (!target.trim() || NON_SUBJECT_LINK.test(target)) return null;
	const open = m[1] ?? '';
	let after = text.slice(m[0].length);
	let close = '';
	if (open) {
		if (!after.startsWith(open)) return null; // stray quote: not a quoted phrase
		close = open;
		after = after.slice(1);
	}
	return {
		target,
		label: m[3] === undefined ? null : m[3],
		after,
		wrap: [open, (m[4] ?? '') + close],
	};
}

/** Label for a `[[target|]]` pipe trick: drop namespace and trailing parenthetical. */
function pipeTrick(target: string): string {
	return collapse(target.replace(/^[^:]*:/, '').replace(/\s*\([^)]*\)\s*$/, ''));
}

/** Clean residual text after the subject link: markup stripped, leading separators dropped. */
function residualNote(text: string): string {
	return stripWikiMarkup(text)
		.replace(/^[\s;,/:–—-]+/, '')
		.trim();
}

function parseLine(line: string, tally: Tally): LineResult | null {
	const bullet = line.match(/^\s*([*#]+)\s*(.*)$/);
	if (!bullet) return null;
	const depth = (bullet[1] ?? '').length - 1;
	const { rest, markers, notes } = takeTemplates(bullet[2] ?? '', tally);
	// Bold/italic markup wraps vessel names (''[[Millennium Falcon]]''): drop it
	// before looking for the leading link.
	const text = rest.replace(/'{2,}/g, '');

	let name = '';
	let page: string | undefined;
	const noteParts: string[] = [];
	const link = leadingLink(text);
	if (link && !/^'s\b/.test(link.after)) {
		const rawLabel = link.label === null ? link.target : link.label || pipeTrick(link.target);
		name = collapse(link.wrap[0] + stripWikiMarkup(rawLabel) + link.wrap[1]);
		page = normalizeTarget(link.target);
		const residual = residualNote(link.after);
		if (residual) noteParts.push(residual);
	} else {
		// Plain-text entry (~0.1%), or a link that is only part of the name
		// ("[[Jabba]]'s palace") — the link target is not the subject.
		name = stripWikiMarkup(text);
	}
	if (!name) return { entry: null };

	for (const n of notes) if (!noteParts.includes(n)) noteParts.push(n);
	const entry: StoredAppearanceEntry = { name };
	if (page) entry.page = page;
	if (markers.length) entry.markers = markers;
	if (noteParts.length) entry.note = noteParts.join('; ');
	if (depth > 0) entry.depth = depth;
	return { entry };
}

/** Parse every `{{App}}` on the page into the stored `appearances` shape. */
export function parseAppearancesWikitext(wikitext: string): ParsedAppearances {
	const apps = extractTemplates(dropRefs(dropComments(wikitext)), 'App');
	const byCategory = new Map<AppearanceCategory, StoredAppearanceEntry[]>();
	const unknownParams = new Set<string>();
	const tally: Tally = { unknownTemplates: new Map() };
	let subheadings = 0;
	let skippedLines = 0;
	let emptyEntries = 0;

	for (const body of apps) {
		for (const part of splitTopLevelFields(expandLiteralTemplates(body)).slice(1)) {
			const eq = part.indexOf('=');
			if (eq === -1) continue;
			const param = normalizeParam(part.slice(0, eq));
			const value = part.slice(eq + 1);
			if (!value.trim()) continue;
			const category = PARAM_TO_CATEGORY[param];
			if (!category) {
				unknownParams.add(param);
				continue;
			}
			const entries = byCategory.get(category) ?? [];
			for (const line of value.split('\n')) {
				if (!line.trim()) continue;
				const res = parseLine(line, tally);
				if (res === null) {
					if (SUBHEADING_LINE.test(line)) subheadings++;
					else skippedLines++;
					continue;
				}
				if (res.entry) entries.push(res.entry);
				else emptyEntries++;
			}
			if (entries.length) byCategory.set(category, entries);
		}
	}

	const appearances: StoredAppearances = {};
	let entryCount = 0;
	for (const category of APPEARANCE_CATEGORIES) {
		const entries = byCategory.get(category);
		if (entries?.length) {
			appearances[category] = entries;
			entryCount += entries.length;
		}
	}
	return {
		appearances,
		entryCount,
		diagnostics: {
			appTemplates: apps.length,
			unknownParams: [...unknownParams].sort(),
			unknownTemplates: Object.fromEntries([...tally.unknownTemplates].sort()),
			subheadings,
			skippedLines,
			emptyEntries,
		},
	};
}

/**
 * Display timeline from a raw infobox `timeline` value. Unlike `stripWikiMarkup`
 * (which drops every template), `{{C|…}}` labels are kept as "(…)", so
 * *Darth Plagueis* reads "67-65 BBY (Part 1); 54-52 BBY (Part 2); …". `<br>` and
 * line breaks become "; ". Refs, comments and other templates are dropped.
 */
export function buildTimelineNotes(raw: string | undefined): string | null {
	if (!raw) return null;
	let s = expandLiteralTemplates(dropRefs(dropComments(raw)));
	for (let i = 0; i < MAX_TEMPLATE_NESTING && s.includes('{{'); i++) {
		s = s.replace(INNERMOST_TEMPLATE, (_m, body: string) => {
			const { name, args } = splitTemplate(body);
			return name === 'c' && args[0] ? ` (${args[0]})` : '';
		});
	}
	s = s.replace(/&mdash;/g, '—').replace(/&#32;/g, ' ');
	const segments = s
		.split(/<br\s*\/?>|\n/i)
		.map((seg) => stripWikiMarkup(seg).replace(/\(\s+/g, '(').replace(/\s+\)/g, ')'))
		.filter(Boolean);
	return segments.length ? segments.join('; ') : null;
}

/** The enrichment content of one page: appearances + infobox timeline. */
export type PageEnrichmentContent = ParsedAppearances & {
	readonly timeline_notes: string | null;
	/** Whether the page has a `{{Book}}` infobox (false = likely not a book page). */
	readonly hasBookInfobox: boolean;
};

export function parsePageEnrichment(wikitext: string): PageEnrichmentContent {
	const infobox = parseBookInfobox(wikitext);
	return {
		...parseAppearancesWikitext(wikitext),
		timeline_notes: buildTimelineNotes(infobox?.timeline),
		hasBookInfobox: infobox !== null,
	};
}
