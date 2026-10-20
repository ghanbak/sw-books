/**
 * Phase 2 of the Wookieepedia discovery pipeline: identity resolution.
 *
 * `classify()` reconciles the discovered novels (Phase 1's `DiscoveredBook[]`)
 * against the existing catalog and labels each one NEW / MATCHED / DIFFERS /
 * AMBIGUOUS. It is PURE and DB-free: the caller fetches the catalog (live DB or,
 * in dev mode, data/books.csv) and passes it in, so the whole cascade unit-tests
 * without a database or network.
 *
 * Identity cascade (first decisive step wins; `canon` is ALWAYS part of the key,
 * so Canon and Legends twins never match each other):
 *   1. ISBN-13 set intersection + corroboration — a shared ISBN alone is NOT
 *      decisive (omnibus / box-set / reissue editions reuse ISBNs); it must be
 *      corroborated by a matching normalized title or an overlapping author
 *      surname set, else it downgrades to review (AMBIGUOUS).
 *   2. Normalized title + FULL author-surname set + canon (exact).
 *   3. Fuzzy title (token-sort ratio ≥ threshold) — review-only, never an
 *      automatic match; always AMBIGUOUS.
 *
 * NEW rows get a proposed slug via `slugify` + `ensureUniqueSlug` against the
 * catalog's existing slugs. A Canon/Legends base-slug collision is broken by a
 * STABLE key (lower `source_pageid` keeps the clean slug; a colliding Legends
 * twin gets `-legends`) so re-runs never flip.
 *
 * Classification is computed here at diff-time — it is deliberately NOT a column
 * in the discovery CSV (that would churn when the *catalog* changes).
 */
import type { BookFields } from '../catalog';
import { normalizeIsbn } from '../isbn';
import { ensureUniqueSlug, slugify } from '../slug';
import type { DiscoveredBook } from './derive';
import { cleanTitle } from './parse';

/** A catalog row to match against — the live DB `books` row or a `books.csv`
 *  row built through `buildBookFields`. `id` is optional so both shapes fit. */
export type CatalogBook = BookFields & { id?: string | null };

export type MatchClass = 'NEW' | 'MATCHED' | 'DIFFERS' | 'AMBIGUOUS';

/** How the decisive (or downgraded) step reached its verdict. */
export type MatchMethod = 'isbn' | 'title-author' | 'fuzzy' | 'none';

/** One wiki-owned field whose catalog value differs from the discovered value.
 *  A suggestion only — never auto-applied. */
export type FieldDiff = {
	readonly field: string;
	/** Discovered (Wookieepedia) value, for display. */
	readonly discovered: string;
	/** Current catalog value, for display. */
	readonly catalog: string;
};

export type Classification = {
	readonly discovered: DiscoveredBook;
	readonly class: MatchClass;
	readonly method: MatchMethod;
	/** Short, deterministic human note explaining the verdict. */
	readonly reason: string;
	/** Slug of the single matched catalog row (MATCHED / DIFFERS), else null. */
	readonly matchSlug: string | null;
	/** Candidate catalog slugs for AMBIGUOUS rows (deterministically ordered). */
	readonly candidates: readonly string[];
	/** Differing wiki-owned fields for DIFFERS rows (suggestions, not applied). */
	readonly diffs: readonly FieldDiff[];
	/** Proposed slug for NEW rows (slugify + ensureUniqueSlug + twin tiebreak). */
	readonly proposedSlug: string | null;
};

/** Fuzzy token-sort ratio (0–100) at or above which a title pair is a review
 *  candidate. Integer so the threshold comparison is exact and deterministic. */
export const FUZZY_THRESHOLD = 92;

/**
 * Wiki-owned fields compared for DIFFERS. These are the facts Wookieepedia is
 * the source for; curated-only columns (cover_image, synopsis, era, language)
 * are intentionally excluded. `canon` is part of the identity key, so it can
 * never differ on a match. A diff is only raised when the discovered value is
 * non-empty — the crawler never suggests clearing a curated catalog value.
 */
const WIKI_OWNED_FIELDS = [
	'author',
	'isbn',
	'format',
	'publisher',
	'date_published',
	'series_name',
	'timeline_order',
	'type',
] as const;

const ARRAY_FIELDS = new Set(['author', 'isbn', 'format']);

// --- Normalization helpers (small, reused — not duplicated slug logic) --------

/**
 * Normalized title key for equality + fuzzy comparison. Reuses the slug
 * normalization (lowercase, strip diacritics/punctuation) after dropping a
 * trailing `(novel)`/`(novelization)` disambiguation parenthetical, so title
 * punctuation/casing variance doesn't produce false NEWs.
 */
export function normalizeTitleKey(title: string): string {
	return slugify(cleanTitle(title));
}

/** Surname (last normalized token) of a single author name. */
function surnameOf(author: string): string {
	const tokens = slugify(author).split('-').filter(Boolean);
	return tokens[tokens.length - 1] ?? '';
}

/** The FULL set of author surnames — compared whole (never a single surname). */
export function authorSurnameSet(authors: readonly string[] | null): Set<string> {
	const out = new Set<string>();
	for (const a of authors ?? []) {
		const s = surnameOf(a);
		if (s) out.add(s);
	}
	return out;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
	if (a.size !== b.size) return false;
	for (const v of a) if (!b.has(v)) return false;
	return true;
}

function setsOverlap(a: Set<string>, b: Set<string>): boolean {
	for (const v of a) if (b.has(v)) return true;
	return false;
}

/** Normalize a catalog/discovered ISBN list to a set of valid ISBN-13 strings. */
function isbn13Set(isbns: readonly string[] | null): Set<string> {
	const out = new Set<string>();
	for (const raw of isbns ?? []) {
		const n = normalizeIsbn(raw);
		if (n) out.add(n);
	}
	return out;
}

// --- Fuzzy token-sort ratio ---------------------------------------------------

/** Token-sorted normalized string: tokens of the normalized title, sorted and
 *  space-joined, so word order doesn't affect the ratio. */
function tokenSort(title: string): string {
	return slugify(cleanTitle(title)).split('-').filter(Boolean).sort().join(' ');
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	let curr = new Array<number>(b.length + 1);
	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(
				(prev[j] ?? 0) + 1, // deletion
				(curr[j - 1] ?? 0) + 1, // insertion
				(prev[j - 1] ?? 0) + cost, // substitution
			);
		}
		[prev, curr] = [curr, prev];
	}
	return prev[b.length] ?? 0;
}

/** Integer token-sort similarity ratio (0–100) between two titles. */
export function tokenSortRatio(a: string, b: string): number {
	const x = tokenSort(a);
	const y = tokenSort(b);
	if (!x && !y) return 100;
	const maxLen = Math.max(x.length, y.length);
	if (maxLen === 0) return 100;
	return Math.round((1 - levenshtein(x, y) / maxLen) * 100);
}

// --- Field diffing ------------------------------------------------------------

function isEmptyValue(v: unknown): boolean {
	if (v == null) return true;
	if (Array.isArray(v)) return v.length === 0;
	if (typeof v === 'string') return v.trim() === '';
	return false;
}

function displayValue(field: string, v: unknown): string {
	if (v == null) return '∅';
	if (Array.isArray(v)) return v.join('; ') || '∅';
	if (field === 'date_published' && typeof v !== 'string') return String(v);
	return String(v);
}

/** Normalize a field's array value to a comparable set of trimmed members. */
function fieldSet(field: string, v: unknown): Set<string> {
	const arr = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
	if (field === 'isbn') return isbn13Set(arr);
	return new Set(arr);
}

/**
 * Whether a wiki-owned field is a genuine suggestion. Array fields (isbn,
 * author, format) are ADDITIVE: a diff is raised only when the wiki knows a
 * member the catalog lacks (discovered ⊄ catalog). A curated catalog array that
 * is a superset of the wiki's — the common case, since the catalog carries the
 * full enriched ISBN/edition set — is NOT flagged. Scalar fields diff on plain
 * inequality.
 */
function fieldDiffers(field: string, dv: unknown, cv: unknown): boolean {
	if (ARRAY_FIELDS.has(field)) {
		const dSet = fieldSet(field, dv);
		const cSet = fieldSet(field, cv);
		for (const m of dSet) if (!cSet.has(m)) return true; // wiki has something new
		return false;
	}
	return String(dv ?? '').trim() !== String(cv ?? '').trim();
}

/** Wiki-owned fields where the discovered value is present AND the wiki carries
 *  information the catalog does not. Suggestions only, never auto-applied. */
function diffFields(d: DiscoveredBook, c: CatalogBook): FieldDiff[] {
	const dRow = d as unknown as Record<string, unknown>;
	const cRow = c as unknown as Record<string, unknown>;
	const diffs: FieldDiff[] = [];
	for (const field of WIKI_OWNED_FIELDS) {
		const dv = dRow[field];
		if (isEmptyValue(dv)) continue; // never suggest clearing a curated value
		if (fieldDiffers(field, dv, cRow[field])) {
			diffs.push({
				field,
				discovered: displayValue(field, dv),
				catalog: displayValue(field, cRow[field]),
			});
		}
	}
	return diffs;
}

// --- Cascade ------------------------------------------------------------------

type Prepared = {
	readonly book: CatalogBook;
	readonly titleKey: string;
	readonly surnames: Set<string>;
	readonly isbns: Set<string>;
};

function prepare(catalog: readonly CatalogBook[]): Map<string, Prepared[]> {
	const byCanon = new Map<string, Prepared[]>();
	for (const book of catalog) {
		const p: Prepared = {
			book,
			titleKey: normalizeTitleKey(book.title),
			surnames: authorSurnameSet(book.author),
			isbns: isbn13Set(book.isbn),
		};
		const bucket = byCanon.get(book.canon);
		if (bucket) bucket.push(p);
		else byCanon.set(book.canon, [p]);
	}
	return byCanon;
}

function matchedOrDiffers(d: DiscoveredBook, c: CatalogBook, method: MatchMethod): Classification {
	const diffs = diffFields(d, c);
	return {
		discovered: d,
		class: diffs.length ? 'DIFFERS' : 'MATCHED',
		method,
		reason:
			diffs.length === 0
				? `matched on ${method}; no wiki-owned field differs`
				: `matched on ${method}; ${diffs.length} wiki-owned field(s) differ (suggestions)`,
		matchSlug: c.slug,
		candidates: [c.slug],
		diffs,
		proposedSlug: null,
	};
}

function ambiguous(
	d: DiscoveredBook,
	cands: readonly Prepared[],
	method: MatchMethod,
	reason: string,
): Classification {
	return {
		discovered: d,
		class: 'AMBIGUOUS',
		method,
		reason,
		matchSlug: null,
		candidates: cands.map((p) => p.book.slug).sort(byCodeUnit),
		diffs: [],
		proposedSlug: null,
	};
}

function byCodeUnit(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Classify a single discovered row against the catalog partitioned by canon.
 *  NEW rows get `proposedSlug` filled in a later batch pass. */
function classifyOne(d: DiscoveredBook, byCanon: Map<string, Prepared[]>): Classification {
	const sameCanon = byCanon.get(d.canon) ?? [];
	const dTitleKey = normalizeTitleKey(d.title);
	const dSurnames = authorSurnameSet(d.author);
	const dIsbns = isbn13Set(d.isbn);

	// Step 1 — ISBN-13 intersection + corroboration.
	if (dIsbns.size > 0) {
		const isbnCands = sameCanon.filter((p) => setsOverlap(p.isbns, dIsbns));
		if (isbnCands.length === 1) {
			const c = isbnCands[0] as Prepared;
			const corroborated = c.titleKey === dTitleKey || setsOverlap(c.surnames, dSurnames);
			if (corroborated) return matchedOrDiffers(d, c.book, 'isbn');
			return ambiguous(
				d,
				isbnCands,
				'isbn',
				'shared ISBN but neither title nor author corroborates (possible omnibus/reissue) — review',
			);
		}
		if (isbnCands.length > 1) {
			return ambiguous(d, isbnCands, 'isbn', 'shared ISBN matches multiple catalog rows — review');
		}
	}

	// Step 2 — normalized title + FULL author-surname set + canon.
	if (dTitleKey) {
		const taCands = sameCanon.filter(
			(p) => p.titleKey === dTitleKey && setsEqual(p.surnames, dSurnames),
		);
		if (taCands.length === 1)
			return matchedOrDiffers(d, (taCands[0] as Prepared).book, 'title-author');
		if (taCands.length > 1) {
			return ambiguous(
				d,
				taCands,
				'title-author',
				'title + author set matches multiple catalog rows — review',
			);
		}
	}

	// Step 3 — fuzzy title (review-only, never an automatic match).
	const fuzzy = sameCanon
		.map((p) => ({ p, ratio: tokenSortRatio(d.title, p.book.title) }))
		.filter((x) => x.ratio >= FUZZY_THRESHOLD)
		.sort((a, b) => b.ratio - a.ratio || byCodeUnit(a.p.book.slug, b.p.book.slug));
	if (fuzzy.length > 0) {
		const top = (fuzzy[0] as { ratio: number }).ratio;
		return ambiguous(
			d,
			fuzzy.map((x) => x.p),
			'fuzzy',
			`fuzzy title match (top ${top}% ≥ ${FUZZY_THRESHOLD}%) — review, not auto-matched`,
		);
	}

	// No candidate at any step → NEW (proposedSlug assigned in the batch pass).
	return {
		discovered: d,
		class: 'NEW',
		method: 'none',
		reason: 'no ISBN, title+author, or fuzzy match in the catalog',
		matchSlug: null,
		candidates: [],
		diffs: [],
		proposedSlug: null,
	};
}

/**
 * Assign deterministic proposed slugs to the NEW rows. `slugify(title)` is the
 * base; collisions resolve against the catalog's existing slugs AND slugs
 * already assigned in this run. For a Canon/Legends base-slug collision the
 * lower `source_pageid` keeps the clean slug (stable across re-runs), and a
 * colliding Legends twin prefers the `-legends` suffix over a numeric one.
 */
function assignNewSlugs(news: Classification[], catalogSlugs: ReadonlySet<string>): void {
	// Group NEW rows by base slug so twins are resolved together.
	const groups = new Map<string, Classification[]>();
	for (const n of news) {
		const base = slugify(n.discovered.title);
		const g = groups.get(base);
		if (g) g.push(n);
		else groups.set(base, [n]);
	}

	const taken = new Set<string>(catalogSlugs);
	// Process groups in a stable order (base slug) for deterministic assignment.
	for (const base of [...groups.keys()].sort(byCodeUnit)) {
		const members = (groups.get(base) as Classification[])
			.slice()
			// Lower source_pageid keeps the clean slug; stable tie-break by title.
			.sort(
				(a, b) =>
					a.discovered.source_pageid - b.discovered.source_pageid ||
					byCodeUnit(a.discovered.title, b.discovered.title),
			);
		for (const n of members) {
			// Lowest pageid reaches a free base first and keeps the clean slug. A
			// Legends twin whose clean base is already taken (by the catalog or an
			// earlier member) prefers the `-legends` suffix over a numeric one;
			// Canon rows always fall to numeric suffixes.
			const preferred =
				n.discovered.canon === 'Legends' && taken.has(base) ? `${base}-legends` : base;
			const slug = ensureUniqueSlug(preferred, taken);
			taken.add(slug);
			(n as { proposedSlug: string | null }).proposedSlug = slug;
		}
	}
}

/**
 * Classify every discovered row against the catalog. Pure: no DB, no network.
 * Order of the output matches the input order.
 */
export function classify(
	discovered: readonly DiscoveredBook[],
	catalog: readonly CatalogBook[],
): Classification[] {
	const byCanon = prepare(catalog);
	const results = discovered.map((d) => classifyOne(d, byCanon));
	const catalogSlugs = new Set(catalog.map((c) => c.slug));
	assignNewSlugs(
		results.filter((r) => r.class === 'NEW'),
		catalogSlugs,
	);
	return results;
}

/** Catalog books not resolved by any discovered row (informational). Keyed by
 *  slug of the single matched catalog row on MATCHED/DIFFERS classifications. */
export function unmatchedCatalog(
	results: readonly Classification[],
	catalog: readonly CatalogBook[],
): CatalogBook[] {
	const matched = new Set<string>();
	for (const r of results) if (r.matchSlug) matched.add(r.matchSlug);
	return catalog.filter((c) => !matched.has(c.slug));
}
