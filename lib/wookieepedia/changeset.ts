import { slugify } from '../slug';
/**
 * Build the reviewable catalog changeset from the Wookieepedia discovery set
 * and the LIVE catalog. Pure and DB/network-free: the build script fetches the
 * catalog, the OL/GB lookups, and the wiki date precisions, and passes them in.
 *
 * Field policy (user decisions, 2026-10-20):
 *   - Existing rows: only `date_published` (wiki value wins when it differs)
 *     and `format` (additive, ordered, deduped union — never removes a format).
 *     Nothing else on an existing row is touched.
 *   - ISBNs: wiki ISBNs are NEVER added or merged. The only ISBN change is a
 *     CONFLICT FIX: a catalog ISBN that the wiki assigns to a DIFFERENT book is
 *     replaced, in place, by the holder's own wiki ISBN; `primary_isbn` follows
 *     if it was the removed ISBN, so `primary_isbn ∈ isbn[]` holds. Anything
 *     unclear is flagged for the operator instead of fixed.
 *   - NEW rows: inserted with full catalog fields (edition variants included,
 *     a small title exclusion list applied by the caller). `type` comes from
 *     the Canon tier bucket, or for Legends from OL/GB audience evidence; when
 *     undetermined the insert carries `needs_type: true` and no `type`.
 *
 * Identity for updates is computed against the catalog AS IT WILL BE after the
 * ISBN fixes, so a misfiled ISBN can't route one book's wiki facts onto another.
 */
import type { AudienceSignal } from '../sources/lookup';
import type { AudienceEvidence } from './audience';
import { decideType } from './audience';
import type { BookType } from './categories';
import type { DiscoveredBook } from './derive';
import {
	type CatalogBook,
	type Classification,
	type MatchMethod,
	authorSurnameSet,
	classify,
	createTitleIndex,
	titlesCorrespond,
} from './match';
import { type DatePrecision, normalizeIsbn } from './parse';

export const CHANGESET_VERSION = 2;

/** Placeholder owner for an ISBN moving to a NEW insert; resolved to `insert:<slug>`. */
const NEW_INSERT_OWNER = 'insert:?';

const BOOK_TYPES: ReadonlySet<string> = new Set<BookType>([
	'Adult Novel',
	'YA Novel',
	'Middle Grade Novel',
]);

export function isBookType(v: unknown): v is BookType {
	return typeof v === 'string' && BOOK_TYPES.has(v);
}

/** A live catalog row (DB `books` row). `id` is required here — updates key on it. */
export type LiveBook = CatalogBook & { id: string };

/** What the build script looked up for one would-be insert (cached on disk). */
export type InsertLookup = {
	readonly cover: { readonly url: string; readonly source: string } | null;
	readonly audience: readonly AudienceSignal[];
};

export type BuildInput = {
	readonly discovered: readonly DiscoveredBook[];
	readonly catalog: readonly LiveBook[];
	/** Wiki titles never inserted (policy), with the reason. */
	readonly excludedTitles: ReadonlyMap<string, string>;
	/** Wiki titles whose page carries `{{Canceled|…}}` — auto-excluded. */
	readonly canceledTitles: ReadonlySet<string>;
	/** Lookups keyed by discovered (wiki) title; missing → no cover or audience evidence. */
	readonly lookups: ReadonlyMap<string, InsertLookup>;
	/** Raw wiki release-date precision keyed by discovered title (absent → 'day'). */
	readonly datePrecision: ReadonlyMap<string, DatePrecision>;
	/** Open Library's title for an ISBN (conflict evidence), when fetched. */
	readonly olTitleByIsbn: ReadonlyMap<string, string>;
	/** Open Library cover (HEAD-checked) for an ISBN, used to rebuild covers that
	 *  were derived from a misfiled ISBN. `null` = OL has no valid cover. */
	readonly olCoverByIsbn: ReadonlyMap<
		string,
		{ readonly url: string; readonly source: string } | null
	>;
	/** Flagged date updates the operator reviewed and accepted, as `dateApprovalKey`s. */
	readonly approvedDateUpdates: ReadonlySet<string>;
	/** Operator-supplied `type` for inserts, keyed by wiki title (wins over lookup). */
	readonly typeOverrides: Readonly<Record<string, string>>;
	/** Wiki publisher values that run several imprints together → the one to keep. */
	readonly publisherSplits: ReadonlyMap<string, string>;
	/** YYYY-MM-DD the build ran — only used to flag not-yet-released inserts. */
	readonly asOf: string;
};

// --- Output shapes (key order here IS the JSON key order) ---------------------

export type IsbnState = { readonly isbn: string[]; readonly primary_isbn: string | null };

export type IsbnFix = {
	readonly id: string;
	readonly slug: string;
	readonly title: string;
	readonly before: IsbnState;
	readonly after: IsbnState;
	readonly replacements: ReadonlyArray<{
		readonly removed: string;
		readonly replacement: string;
		readonly evidence: {
			/** Wiki page whose infobox lists the removed ISBN. */
			readonly removed_isbn_wiki_title: string;
			/** Who gets the ISBN: `catalog:<slug>` (the row that wiki page resolves
			 *  to by title + author + canon) or `insert:<slug>` (a NEW book in this
			 *  changeset — e.g. an edition variant whose ISBN sat on the base row). */
			readonly removed_isbn_owner: string;
			/** This row's own wiki page and its infobox ISBNs. */
			readonly holder_wiki_title: string;
			readonly holder_wiki_isbns: string[];
			/** Open Library's title for the removed ISBN (independent check), if fetched. */
			readonly openlibrary_title: string | null;
		};
	}>;
	readonly flags: string[];
};

export type FlaggedIsbnConflict = {
	readonly slug: string;
	readonly isbn: string;
	readonly wiki_title: string;
	readonly reason: string;
};

export type FieldChange<T> = { readonly before: T; readonly after: T };

export type Update = {
	readonly id: string;
	readonly slug: string;
	readonly title: string;
	readonly wiki_title: string;
	readonly match_method: MatchMethod;
	readonly changes: {
		readonly date_published?: FieldChange<string | null>;
		readonly format?: FieldChange<string[]>;
	};
	readonly flags: string[];
	/** For flagged updates: `approved` once the operator accepted this exact change. */
	readonly review_status: 'approved' | 'pending' | null;
};

/** A cover rebuilt because the current URL was derived from a misfiled ISBN. */
export type CoverFix = {
	readonly id: string;
	readonly slug: string;
	readonly title: string;
	readonly before: string | null;
	readonly after: string;
	readonly source: string;
	readonly reason: string;
};

export type InsertRow = {
	readonly title: string;
	readonly slug: string;
	readonly author: string[];
	readonly cover_image: string | null;
	readonly canon: string;
	readonly date_published: string | null;
	readonly format: string[];
	readonly isbn: string[];
	readonly primary_isbn: string | null;
	readonly language: string;
	readonly publisher: string | null;
	readonly series_name: string | null;
	readonly series_order: number | null;
	readonly timeline_order: number | null;
	readonly synopsis: string | null;
	readonly type?: BookType;
	readonly era: string | null;
};

export type Insert = {
	readonly slug: string;
	readonly wiki_title: string;
	readonly source_pageid: number;
	readonly needs_type?: true;
	readonly row: InsertRow;
	readonly type_source: 'wiki-bucket' | 'lookup' | 'override' | null;
	readonly type_reason: string;
	readonly type_evidence: readonly AudienceEvidence[];
	readonly cover_source: string | null;
	readonly flags: string[];
};

export type ReviewItem = {
	readonly wiki_title: string;
	readonly slugs: string[];
	readonly reason: string;
};

export type Changeset = {
	readonly version: number;
	readonly as_of: string;
	readonly policy: Record<string, string>;
	readonly summary: {
		readonly inserts: number;
		readonly inserts_needs_type: number;
		readonly updates: number;
		readonly updates_flagged_pending: number;
		readonly isbn_fixes: number;
		readonly cover_fixes: number;
		readonly flagged_isbn_conflicts: number;
		readonly excluded: number;
		readonly review: number;
	};
	readonly isbn_fixes: IsbnFix[];
	readonly cover_fixes: CoverFix[];
	readonly flagged_isbn_conflicts: FlaggedIsbnConflict[];
	readonly updates: Update[];
	readonly inserts: Insert[];
	readonly excluded: ReviewItem[];
	readonly review: ReviewItem[];
	/** Every insert publisher value the normalization changed (for review). */
	readonly publisher_changes: PublisherChange[];
};

export type PublisherChange = {
	readonly from: string;
	readonly to: string;
	readonly rule: 'split' | 'catalog-spelling' | 'split+catalog-spelling';
	readonly slugs: string[];
};

export const POLICY: Record<string, string> = {
	existing_rows:
		'only date_published (wiki wins when it differs, compared at the wiki date precision) and format (additive ordered union)',
	isbn: 'no wiki ISBN is added or merged; only conflict fixes (an ISBN the wiki assigns to a different book is replaced by the holder row’s own wiki ISBN; primary_isbn follows)',
	inserts:
		'NEW rows minus excluded titles; plain insert (never upsert); type from the Canon bucket or OL/GB evidence, else needs_type',
	covers:
		'Open Library / Google Books by ISBN only — never the wiki image (publisher copyright); a cover built from a misfiled ISBN is rebuilt from the corrected ISBN via Open Library (cover_image only), else flagged',
	publisher:
		'inserts: a run-together multi-imprint value keeps the chosen (US/primary) imprint; a spelling/punctuation variant of an existing catalog publisher takes the catalog spelling; distinct imprints are never merged',
	exclusions:
		'explicit title list plus any wiki page carrying {{Canceled}} (never-published works are not inserted)',
	synopsis:
		'inserts get synopsis null — catalog synopses are hand-written one-liners; wiki prose is CC BY-SA and publisher blurbs are not terse',
};

// --- Small pure helpers --------------------------------------------------------

function byCodeUnit(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Valid, de-duplicated ISBN-13s in input order. */
export function normalizeIsbnList(isbns: readonly string[] | null): string[] {
	const out: string[] = [];
	for (const raw of isbns ?? []) {
		const n = normalizeIsbn(raw);
		if (n && !out.includes(n)) out.push(n);
	}
	return out;
}

function formatKey(f: string): string {
	return f.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Additive format union, mirroring the DB's `ordered_text_union`: the catalog's
 * formats first (order kept, nothing removed), then each wiki format the
 * catalog lacks. Membership is case/space-insensitive so "Hard Cover" already
 * covers "Hardcover" (no near-duplicate is added).
 */
export function unionFormats(catalog: readonly string[] | null, wiki: readonly string[] | null) {
	const out = [...(catalog ?? [])];
	const seen = new Set(out.map(formatKey));
	for (const f of wiki ?? []) {
		const k = formatKey(f);
		if (!k || seen.has(k)) continue;
		seen.add(k);
		out.push(f);
	}
	return out;
}

/** Truncate an ISO date to a precision for comparison. */
function datePrefix(iso: string, precision: DatePrecision): string {
	return precision === 'year' ? iso.slice(0, 4) : precision === 'month' ? iso.slice(0, 7) : iso;
}

/**
 * The date change for an existing row, or null when there is none. The wiki
 * wins when it differs — compared at the wiki's precision, so a month-only
 * wiki date ("February 1996", stored padded as 1996-02-01) does not overwrite a
 * catalog day in that same month.
 */
export function dateChange(
	catalog: string | null,
	wiki: string | null,
	precision: DatePrecision,
): FieldChange<string | null> | null {
	if (!wiki) return null;
	if (catalog && datePrefix(catalog, precision) === datePrefix(wiki, precision)) return null;
	return { before: catalog, after: wiki };
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Replace `removed` by `replacement` in place, then dedupe (first occurrence wins). */
export function replaceIsbn(isbns: readonly string[], removed: string, replacement: string) {
	const out: string[] = [];
	for (const v of isbns) {
		const next = v === removed ? replacement : v;
		if (!out.includes(next)) out.push(next);
	}
	return out;
}

/** A trailing marketing tagline ("…: An Alphabet Squadron Novel"), but never an
 *  edition marker (junior / expanded / deluxe / graphic). */
const TAGLINE = /:\s+an?\s+(?:(?!junior|expanded|deluxe|graphic)[\w'’ -])+?\s+novel\s*$/i;

function coreTitle(t: string): string {
	return t
		.replace(/^star wars:?\s+/i, '')
		.replace(TAGLINE, '')
		.trim();
}

/**
 * Looser title identity for rows ALREADY linked by a shared ISBN: equal or
 * series-prefixed titles, also ignoring a leading "Star Wars" brand and a
 * trailing "An X Novel" tagline ("Star Wars Jedi: Battle Scars" ≡ "Jedi: Battle
 * Scars", "Shadow Fall: An Alphabet Squadron Novel" ≡ "Shadow Fall"). Edition
 * variants ("…: A Junior Novel", "…: Expanded Edition") stay distinct.
 */
export function sameWork(a: string, b: string): boolean {
	return titlesCorrespond(a, b) || titlesCorrespond(coreTitle(a), coreTitle(b));
}

function authorsOverlap(a: readonly string[] | null, b: readonly string[] | null): boolean {
	const bs = authorSurnameSet(b);
	for (const s of authorSurnameSet(a)) if (bs.has(s)) return true;
	return false;
}

// --- ISBN conflict fixes -------------------------------------------------------

type ConflictResult = { fixes: IsbnFix[]; flagged: FlaggedIsbnConflict[] };

/**
 * Find catalog ISBNs the wiki assigns to a DIFFERENT book and build the fixes.
 * The owning book of each wiki ISBN is decided by TITLE + full author set +
 * canon (never by the ISBN arrays, which are what's suspect). A fix is only
 * emitted when every link in the evidence chain is unambiguous; otherwise the
 * conflict is flagged for the operator.
 */
export function findIsbnConflicts(
	discovered: readonly DiscoveredBook[],
	catalog: readonly LiveBook[],
	olTitleByIsbn: ReadonlyMap<string, string>,
	/** Wiki titles whose ISBN may NOT move to a new insert (they won't be inserted). */
	rejectOwnerless: ReadonlySet<string> = new Set(),
): ConflictResult {
	const owner = createTitleIndex(catalog);
	const ownerOf = new Map<DiscoveredBook, CatalogBook | null>(discovered.map((d) => [d, owner(d)]));
	// Each catalog row's own wiki page(s) — the source of its correct ISBN.
	const wikiFor = new Map<string, DiscoveredBook[]>();
	for (const d of discovered) {
		const o = ownerOf.get(d);
		if (!o) continue;
		const list = wikiFor.get(o.slug);
		if (list) list.push(d);
		else wikiFor.set(o.slug, [d]);
	}
	const holderOfIsbn = new Map<string, LiveBook[]>();
	for (const c of catalog) {
		for (const i of normalizeIsbnList(c.isbn)) {
			const list = holderOfIsbn.get(i);
			if (list) list.push(c);
			else holderOfIsbn.set(i, [c]);
		}
	}

	type Pending = {
		holder: LiveBook;
		removed: string;
		replacement: string;
		d: DiscoveredBook;
		flag: (reason: string) => void;
	};
	const candidates: Pending[] = [];
	const flagged: FlaggedIsbnConflict[] = [];

	for (const d of discovered) {
		const o = ownerOf.get(d) ?? null;
		for (const isbn of normalizeIsbnList(d.isbn)) {
			for (const holder of holderOfIsbn.get(isbn) ?? []) {
				if (o && holder.slug === o.slug) continue; // the right book holds it
				const flag = (reason: string) =>
					flagged.push({ slug: holder.slug, isbn, wiki_title: d.title, reason });
				if (sameWork(d.title, holder.title) && authorsOverlap(d.author, holder.author)) {
					// The holder IS this work (title variance / partial author set).
					if (o)
						flag(`both "${holder.slug}" and "${o.slug}" look like this work — duplicate rows?`);
					continue;
				}
				// No catalog row for the wiki page → the ISBN belongs to a book that is NOT
				// in the catalog yet (e.g. an edition variant). It may move only if that
				// book becomes an insert in this changeset (checked by buildChangeset).
				const ownerLabel = o ? `"${o.slug}"` : `"${d.title}" (not in the catalog)`;
				if (!o && rejectOwnerless.has(d.title)) {
					flag(
						`wiki assigns this ISBN to "${d.title}", which has no catalog row and is not inserted by this changeset — moving it would drop the ISBN`,
					);
					continue;
				}
				const holderWiki = wikiFor.get(holder.slug) ?? [];
				if (holderWiki.length !== 1) {
					flag(
						holderWiki.length === 0
							? `ISBN belongs to ${ownerLabel} per the wiki, but this row has no wiki page to source its own ISBN from`
							: 'this row resolves to several wiki pages — its own ISBN is ambiguous',
					);
					continue;
				}
				const hw = holderWiki[0] as DiscoveredBook;
				const hwIsbns = normalizeIsbnList(hw.isbn);
				if (hwIsbns.includes(isbn)) {
					flag(`the wiki lists this ISBN for both "${d.title}" and "${hw.title}"`);
					continue;
				}
				const current = normalizeIsbnList(holder.isbn);
				// Prefer a wiki ISBN the row already carries (no new ISBN enters), else the first.
				const replacement = hwIsbns.find((i) => current.includes(i)) ?? hwIsbns[0];
				if (!replacement) {
					flag(`ISBN belongs to ${ownerLabel}, but this row's wiki page lists no ISBN`);
					continue;
				}
				const ol = olTitleByIsbn.get(isbn) ?? null;
				if (ol && !olSupports(ol, d.title, holder.title)) {
					flag(`Open Library titles ${isbn} "${ol}", which does not support "${d.title}"`);
					continue;
				}
				candidates.push({ holder, removed: isbn, replacement, d, flag });
			}
		}
	}

	// Second pass: a replacement must not stay on another row after ALL fixes
	// (one fix may free it, e.g. moving a misfiled ISBN off its wrong holder),
	// and one (holder, ISBN) pair must have a single explanation.
	const removedFrom = new Set(candidates.map((p) => `${p.holder.slug}|${p.removed}`));
	const seenPair = new Map<string, Pending>();
	const pending: Pending[] = [];
	for (const p of candidates) {
		const pair = `${p.holder.slug}|${p.removed}`;
		const prior = seenPair.get(pair);
		if (prior) {
			if (prior.replacement !== p.replacement) {
				p.flag('several wiki pages claim this ISBN with different replacements');
			}
			continue;
		}
		seenPair.set(pair, p);
		const elsewhere = (holderOfIsbn.get(p.replacement) ?? []).filter(
			(c) => c.slug !== p.holder.slug && !removedFrom.has(`${c.slug}|${p.replacement}`),
		);
		if (elsewhere.length) {
			p.flag(
				`replacement ${p.replacement} is already on ${elsewhere.map((c) => c.slug).join(', ')}`,
			);
			continue;
		}
		pending.push(p);
	}

	// Group per holder row; apply replacements in a stable order.
	const fixes: IsbnFix[] = [];
	const holders = [...new Set(pending.map((p) => p.holder.slug))].sort(byCodeUnit);
	for (const slug of holders) {
		const items = pending
			.filter((p) => p.holder.slug === slug)
			.sort((a, b) => byCodeUnit(a.removed, b.removed));
		const holder = (items[0] as Pending).holder;
		const before: IsbnState = {
			isbn: [...(holder.isbn ?? [])],
			primary_isbn: holder.primary_isbn ?? null,
		};
		let isbn = before.isbn;
		let primary = before.primary_isbn;
		for (const p of items) {
			isbn = replaceIsbn(isbn, p.removed, p.replacement);
			if (primary === p.removed) primary = p.replacement;
		}
		const flags: string[] = [];
		if (primary != null && !isbn.includes(primary)) {
			flags.push('pre-existing: primary_isbn is not in isbn[] (not changed by this fix)');
		}
		fixes.push({
			id: holder.id,
			slug,
			title: holder.title,
			before,
			after: { isbn, primary_isbn: primary },
			replacements: items.map((p) => {
				const hw = (wikiFor.get(slug) ?? [])[0] as DiscoveredBook;
				return {
					removed: p.removed,
					replacement: p.replacement,
					evidence: {
						removed_isbn_wiki_title: p.d.title,
						removed_isbn_owner: ownerOf.get(p.d)
							? `catalog:${(ownerOf.get(p.d) as CatalogBook).slug}`
							: NEW_INSERT_OWNER,
						holder_wiki_title: hw.title,
						holder_wiki_isbns: normalizeIsbnList(hw.isbn),
						openlibrary_title: olTitleByIsbn.get(p.removed) ?? null,
					},
				};
			}),
			flags,
		});
	}
	flagged.sort((a, b) => byCodeUnit(a.slug, b.slug) || byCodeUnit(a.isbn, b.isbn));
	return { fixes, flagged };
}

/** OL's title (often just "Star Wars …") supports the wiki owner unless it
 *  names the holder's title and not the owner's. */
function olSupports(olTitle: string, ownerTitle: string, holderTitle: string): boolean {
	const ol = slugify(olTitle);
	const has = (t: string) => {
		const k = slugify(t.replace(/^.*?:\s+/, '')); // drop a series prefix
		return k !== '' && ol.includes(k);
	};
	if (has(ownerTitle)) return true;
	// An edition variant's title contains the base title ("Heir to the Empire: The
	// 20th Anniversary Edition"); OL naming the base title can't contradict it.
	if (slugify(ownerTitle).includes(slugify(holderTitle))) return true;
	return !has(holderTitle);
}

/** The catalog with the ISBN fixes applied (in memory). */
function applyFixes(catalog: readonly LiveBook[], fixes: readonly IsbnFix[]): LiveBook[] {
	const byId = new Map(fixes.map((f) => [f.id, f]));
	return catalog.map((c) => {
		const f = byId.get(c.id);
		return f ? { ...c, isbn: f.after.isbn, primary_isbn: f.after.primary_isbn } : c;
	});
}

// --- Updates -------------------------------------------------------------------

/** Stable key an operator approval is recorded against: slug + exact date change. */
export function dateApprovalKey(slug: string, change: FieldChange<string | null>): string {
	return `${slug}:${change.before ?? '∅'}>${change.after ?? '∅'}`;
}

function buildUpdates(
	results: readonly Classification[],
	catalog: readonly LiveBook[],
	datePrecision: ReadonlyMap<string, DatePrecision>,
	approved: ReadonlySet<string>,
	review: ReviewItem[],
): Update[] {
	const bySlug = new Map(catalog.map((c) => [c.slug, c]));
	const grouped = new Map<string, Classification[]>();
	for (const r of results) {
		if ((r.class !== 'MATCHED' && r.class !== 'DIFFERS') || !r.matchSlug) continue;
		const g = grouped.get(r.matchSlug);
		if (g) g.push(r);
		else grouped.set(r.matchSlug, [r]);
	}

	const updates: Update[] = [];
	for (const slug of [...grouped.keys()].sort(byCodeUnit)) {
		const c = bySlug.get(slug) as LiveBook;
		const rs = grouped.get(slug) as Classification[];
		// The wiki page that names THIS book (title corresponds) drives the update;
		// an edition variant matched on a shared ISBN never does.
		const named = rs.filter((r) => sameWork(r.discovered.title, c.title));
		for (const r of rs) {
			if (named.length === 1 && named[0] === r) continue;
			const reason =
				named.length === 1
					? `matched "${slug}" on a shared ISBN but names a different edition/title — not used for updates and not inserted (its ISBN is already on "${slug}")`
					: named.length > 1
						? `one of ${named.length} wiki pages naming "${slug}" — not auto-updated; pick one`
						: `matched "${slug}" (${r.method}) but the titles differ — not auto-updated; confirm the match`;
			review.push({ wiki_title: r.discovered.title, slugs: [slug], reason });
		}
		if (named.length !== 1) continue;
		const r = named[0] as Classification;
		const d = r.discovered;
		const flags: string[] = [];
		const precision = datePrecision.get(d.title) ?? 'day';
		const date = dateChange(c.date_published ?? null, d.date_published ?? null, precision);
		if (date && precision !== 'day') flags.push(`wiki date is ${precision}-precision only`);
		if (date?.before && date.after && date.before.slice(0, 4) !== date.after.slice(0, 4)) {
			flags.push('year changes');
		}
		const formatBefore = [...(c.format ?? [])];
		const formatAfter = unionFormats(formatBefore, d.format);
		const changes: { date_published?: FieldChange<string | null>; format?: FieldChange<string[]> } =
			{};
		if (date) changes.date_published = date;
		if (!arraysEqual(formatBefore, formatAfter)) {
			changes.format = { before: formatBefore, after: formatAfter };
		}
		if (!changes.date_published && !changes.format) continue;
		const reviewStatus =
			flags.length === 0
				? null
				: date && approved.has(dateApprovalKey(slug, date))
					? 'approved'
					: 'pending';
		updates.push({
			id: c.id,
			slug,
			title: c.title,
			wiki_title: d.title,
			match_method: r.method,
			changes,
			flags,
			review_status: reviewStatus,
		});
	}
	return updates;
}

// --- Inserts -------------------------------------------------------------------

function cleanAuthors(authors: readonly string[] | null, flags: string[]): string[] {
	const out: string[] = [];
	for (const a of authors ?? []) {
		if (/^edited by\b/i.test(a)) {
			flags.push(`dropped editor credit "${a}" from author`);
			continue;
		}
		if (/[",]/.test(a)) flags.push(`suspect author value "${a}"`);
		out.push(a);
	}
	if (out.length === 0) flags.push('no author');
	return out;
}

/** Spelling/punctuation-insensitive key: "Disney–Lucasfilm Press" ≡ "Disney Lucasfilm Press". */
function publisherKey(p: string): string {
	return p.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Normalize a wiki publisher for an insert:
 *   1. an explicit run-together value ("Del Rey (US) Arrow Books (UK)") → the
 *      one imprint the operator chose (`splits`);
 *   2. fold to the catalog's existing spelling when the value differs from a
 *      catalog publisher only in punctuation/spacing/case. Distinct imprints
 *      (Random House Worlds vs Del Rey) have different keys, so never merge.
 */
export function normalizePublisher(
	raw: string | null,
	splits: ReadonlyMap<string, string>,
	catalogPublishers: readonly string[],
): { value: string | null; rule: PublisherChange['rule'] | null } {
	const p = raw?.trim() ?? '';
	if (!p || /^none$/i.test(p)) return { value: null, rule: null };
	const split = splits.get(p);
	const base = split ?? p;
	const key = publisherKey(base);
	const known = [...catalogPublishers].sort().find((c) => publisherKey(c) === key);
	const value = known ?? base;
	const spelled = value !== base;
	const rule = split
		? spelled
			? 'split+catalog-spelling'
			: 'split'
		: spelled
			? 'catalog-spelling'
			: null;
	return { value, rule };
}

function cleanPublisher(
	publisher: string | null,
	input: BuildInput,
	slug: string,
	flags: string[],
	changes: Array<{ from: string; to: string; rule: PublisherChange['rule']; slug: string }>,
): string | null {
	const catalogPublishers = [
		...new Set(input.catalog.flatMap((c) => (c.publisher ? [c.publisher] : []))),
	];
	const { value, rule } = normalizePublisher(publisher, input.publisherSplits, catalogPublishers);
	if (rule && publisher && value) changes.push({ from: publisher.trim(), to: value, rule, slug });
	if (value && !rule && (/[()]/.test(value) || /(?:Ltd|Press|Books|Rey|Worlds)\s+\S/.test(value))) {
		flags.push(`suspect publisher value "${value}"`);
	}
	return value;
}

function buildInsert(
	r: Classification,
	input: BuildInput,
	takenIsbns: ReadonlyMap<string, string>,
	pubChanges: Array<{ from: string; to: string; rule: PublisherChange['rule']; slug: string }>,
): Insert {
	const d = r.discovered;
	const slug = r.proposedSlug as string;
	const flags: string[] = [];
	const lookup = input.lookups.get(d.title);

	// type: override > Canon bucket > Legends lookup evidence.
	let type: BookType | null = null;
	let typeSource: Insert['type_source'] = null;
	let typeReason = '';
	let typeEvidence: readonly AudienceEvidence[] = [];
	const override = input.typeOverrides[d.title];
	if (override !== undefined) {
		if (isBookType(override)) {
			type = override;
			typeSource = 'override';
			typeReason = 'operator override (data/discovery/type-overrides.json)';
		} else {
			typeReason = `invalid override "${override}" ignored`;
		}
	}
	if (!type && isBookType(d.type)) {
		type = d.type;
		typeSource = 'wiki-bucket';
		typeReason = 'Canon tier category on Wookieepedia';
	}
	const isbn = normalizeIsbnList(d.isbn);
	if (!type && isbn.length === 0) {
		// No ISBN anchor (often unpublished/cancelled): a title search can land on a
		// comic or another work with the same name — never decide from that alone.
		typeReason = 'no ISBN — search-only audience evidence is not trusted';
	} else if (!type) {
		const decision = decideType(lookup?.audience ?? [], { title: d.title, author: d.author });
		typeEvidence = decision.evidence;
		typeReason = lookup ? decision.reason : 'no lookup performed';
		if (decision.type) {
			type = decision.type;
			typeSource = 'lookup';
		}
	}

	if (isbn.length === 0) flags.push('no ISBN');
	for (const i of isbn) {
		const other = takenIsbns.get(i);
		if (other && other !== slug) flags.push(`ISBN ${i} is also on "${other}"`);
	}
	if (!d.date_published) flags.push('no release date — possibly unpublished/cancelled');
	else if (d.date_published > input.asOf) flags.push(`not yet released (${d.date_published})`);
	if (!lookup?.cover) flags.push('no cover found');

	const author = cleanAuthors(d.author, flags);
	const publisher = cleanPublisher(d.publisher ?? null, input, slug, flags, pubChanges);

	const row: InsertRow = {
		title: d.title,
		slug,
		author,
		cover_image: lookup?.cover?.url ?? null,
		canon: d.canon,
		date_published: d.date_published ?? null,
		format: [...(d.format ?? [])],
		isbn,
		primary_isbn: isbn[0] ?? null,
		language: d.language || 'English',
		publisher,
		series_name: d.series_name ?? null,
		series_order: d.series_order ?? null,
		timeline_order: d.timeline_order ?? null,
		synopsis: null, // catalog synopses are hand-written one-liners; never wiki/publisher prose
		...(type ? { type } : {}),
		era: null,
	};
	return {
		slug,
		wiki_title: d.title,
		source_pageid: d.source_pageid,
		...(type ? {} : { needs_type: true as const }),
		row,
		type_source: typeSource,
		type_reason: typeReason,
		type_evidence: typeEvidence,
		cover_source: lookup?.cover?.source ?? null,
		flags,
	};
}

// --- Orchestration -------------------------------------------------------------

type Resolved = {
	readonly fixes: IsbnFix[];
	readonly flagged: FlaggedIsbnConflict[];
	readonly fixedCatalog: LiveBook[];
	readonly results: Classification[];
};

/**
 * ISBN fixes → post-fix catalog → classification. An ISBN may move to a book
 * not yet in the catalog only if that book really becomes a NEW insert; any
 * that don't are re-run as flags, so a fix can never drop an ISBN on the floor.
 */
function resolveIdentity(
	kept: readonly DiscoveredBook[],
	catalog: readonly LiveBook[],
	olTitleByIsbn: ReadonlyMap<string, string>,
): Resolved {
	const reject = new Set<string>();
	for (;;) {
		const { fixes, flagged } = findIsbnConflicts(kept, catalog, olTitleByIsbn, reject);
		const fixedCatalog = applyFixes(catalog, fixes);
		const results = classify(kept, fixedCatalog);
		const slugOfNew = new Map(
			results.filter((r) => r.class === 'NEW').map((r) => [r.discovered.title, r.proposedSlug]),
		);
		const bad = fixes.flatMap((f) =>
			f.replacements
				.filter(
					(r) =>
						r.evidence.removed_isbn_owner === NEW_INSERT_OWNER &&
						!slugOfNew.has(r.evidence.removed_isbn_wiki_title),
				)
				.map((r) => r.evidence.removed_isbn_wiki_title),
		);
		if (bad.length === 0) {
			const resolved = fixes.map((f) => ({
				...f,
				replacements: f.replacements.map((r) =>
					r.evidence.removed_isbn_owner === NEW_INSERT_OWNER
						? {
								...r,
								evidence: {
									...r.evidence,
									removed_isbn_owner: `insert:${slugOfNew.get(r.evidence.removed_isbn_wiki_title)}`,
								},
							}
						: r,
				),
			}));
			return { fixes: resolved, flagged, fixedCatalog, results };
		}
		for (const t of bad) reject.add(t);
	}
}

/** Every excluded title with its reason (explicit list first, then {{Canceled}}). */
function exclusions(
	discovered: readonly DiscoveredBook[],
	explicit: ReadonlyMap<string, string>,
	canceled: ReadonlySet<string>,
): Map<string, string> {
	const out = new Map<string, string>();
	for (const d of discovered) {
		const why = explicit.get(d.title);
		const isCanceled = canceled.has(d.title);
		if (why) out.set(d.title, isCanceled ? `${why} (also {{Canceled}} on the wiki)` : why);
		else if (isCanceled) out.set(d.title, 'canceled — {{Canceled}} on the Wookieepedia page');
	}
	return out;
}

/** Discovered rows that will be NEW inserts (after exclusions + ISBN fixes) —
 *  lets the build script look up only what it needs. */
export function prospectiveInserts(
	discovered: readonly DiscoveredBook[],
	catalog: readonly LiveBook[],
	excludedTitles: ReadonlySet<string>,
): DiscoveredBook[] {
	const kept = discovered.filter((d) => !excludedTitles.has(d.title));
	return resolveIdentity(kept, catalog, new Map())
		.results.filter((r) => r.class === 'NEW')
		.map((r) => r.discovered);
}

/**
 * ISBN→cover candidates: rows an ISBN fix touches whose cover URL was built from
 * a removed (misfiled) ISBN, paired with the corrected ISBN to rebuild from.
 */
export function coverFixCandidates(
	fixes: readonly IsbnFix[],
	catalog: readonly LiveBook[],
): Array<{ readonly row: LiveBook; readonly removed: string; readonly isbn: string }> {
	const byId = new Map(catalog.map((c) => [c.id, c]));
	const out: Array<{ row: LiveBook; removed: string; isbn: string }> = [];
	for (const f of fixes) {
		const row = byId.get(f.id);
		const cover = row?.cover_image ?? '';
		const r = f.replacements.find((x) => cover.includes(x.removed));
		if (row && r) out.push({ row, removed: r.removed, isbn: r.replacement });
	}
	return out;
}

function buildCoverFixes(
	fixes: readonly IsbnFix[],
	catalog: readonly LiveBook[],
	olCoverByIsbn: BuildInput['olCoverByIsbn'],
	review: ReviewItem[],
): CoverFix[] {
	const coversInUse = new Map(
		catalog.flatMap((c) => (c.cover_image ? [[c.cover_image, c.slug] as const] : [])),
	);
	const out: CoverFix[] = [];
	for (const { row, removed, isbn } of coverFixCandidates(fixes, catalog)) {
		const ol = olCoverByIsbn.get(isbn) ?? null;
		const other = ol ? coversInUse.get(ol.url) : undefined;
		if (!ol || (other && other !== row.slug)) {
			review.push({
				wiki_title: row.title,
				slugs: [row.slug],
				reason: ol
					? `cover was built from misfiled ISBN ${removed}; the OL cover for ${isbn} is already used by "${other}" — cover not changed`
					: `cover was built from misfiled ISBN ${removed}; Open Library has no valid cover for corrected ISBN ${isbn} — cover not changed`,
			});
			continue;
		}
		out.push({
			id: row.id,
			slug: row.slug,
			title: row.title,
			before: row.cover_image ?? null,
			after: ol.url,
			source: ol.source,
			reason: `current cover is built from misfiled ISBN ${removed}; rebuilt from corrected ISBN ${isbn}`,
		});
	}
	return out.sort((a, b) => byCodeUnit(a.slug, b.slug));
}

export function buildChangeset(input: BuildInput): Changeset {
	const excludedBy = exclusions(input.discovered, input.excludedTitles, input.canceledTitles);
	const excluded: ReviewItem[] = [];
	const kept: DiscoveredBook[] = [];
	for (const d of input.discovered) {
		const why = excludedBy.get(d.title);
		if (why) excluded.push({ wiki_title: d.title, slugs: [], reason: why });
		else kept.push(d);
	}

	const { fixes, flagged, fixedCatalog, results } = resolveIdentity(
		kept,
		input.catalog,
		input.olTitleByIsbn,
	);

	const review: ReviewItem[] = [];
	for (const r of results) {
		if (r.class === 'AMBIGUOUS') {
			review.push({ wiki_title: r.discovered.title, slugs: [...r.candidates], reason: r.reason });
		}
	}
	const updates = buildUpdates(
		results,
		fixedCatalog,
		input.datePrecision,
		input.approvedDateUpdates,
		review,
	);
	const coverFixes = buildCoverFixes(fixes, input.catalog, input.olCoverByIsbn, review);

	const takenIsbns = new Map<string, string>();
	for (const c of fixedCatalog)
		for (const i of normalizeIsbnList(c.isbn)) takenIsbns.set(i, c.slug);
	const news = results.filter((r) => r.class === 'NEW');
	for (const r of news) {
		for (const i of normalizeIsbnList(r.discovered.isbn)) {
			if (!takenIsbns.has(i)) takenIsbns.set(i, r.proposedSlug as string);
		}
	}
	const pubChanges: Array<{
		from: string;
		to: string;
		rule: PublisherChange['rule'];
		slug: string;
	}> = [];
	const inserts = news
		.map((r) => buildInsert(r, input, takenIsbns, pubChanges))
		.sort((a, b) => byCodeUnit(a.slug, b.slug));
	const byChange = new Map<string, PublisherChange & { slugs: string[] }>();
	for (const c of pubChanges) {
		const k = `${c.from}\u0000${c.to}`;
		const g = byChange.get(k);
		if (g) g.slugs.push(c.slug);
		else byChange.set(k, { from: c.from, to: c.to, rule: c.rule, slugs: [c.slug] });
	}
	const publisherChanges = [...byChange.values()]
		.map((c) => ({ ...c, slugs: c.slugs.sort(byCodeUnit) }))
		.sort((a, b) => byCodeUnit(a.from, b.from));

	excluded.sort((a, b) => byCodeUnit(a.wiki_title, b.wiki_title));
	review.sort(
		(a, b) => byCodeUnit(a.wiki_title, b.wiki_title) || byCodeUnit(a.slugs.join(), b.slugs.join()),
	);

	return {
		version: CHANGESET_VERSION,
		as_of: input.asOf,
		policy: POLICY,
		summary: {
			inserts: inserts.length,
			inserts_needs_type: inserts.filter((i) => i.needs_type).length,
			updates: updates.length,
			updates_flagged_pending: updates.filter((u) => u.review_status === 'pending').length,
			isbn_fixes: fixes.length,
			cover_fixes: coverFixes.length,
			flagged_isbn_conflicts: flagged.length,
			excluded: excluded.length,
			review: review.length,
		},
		isbn_fixes: fixes,
		cover_fixes: coverFixes,
		flagged_isbn_conflicts: flagged,
		updates,
		inserts,
		excluded,
		review,
		publisher_changes: publisherChanges,
	};
}
