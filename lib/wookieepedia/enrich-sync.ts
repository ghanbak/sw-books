/**
 * Enrichment sync core: book ↔ page mapping, row building, the content-hash
 * gate, and write batching. Pure and DB-free (Node `crypto` only) — the runner
 * `scripts/enrich-wookieepedia.ts` does the I/O and passes everything in.
 *
 * Mapping precedence:
 *   1. Persisted `book_enrichment.source_pageid` rows ARE the mapping. Never
 *      re-pointed by discovery.
 *   2. First run (no row yet): MATCHED / DIFFERS discovery classifications give
 *      book ↔ pageid. AMBIGUOUS and NEW are skipped. A pageid must be a real one
 *      from the discovery sidecar (not the synthetic fallback id), and must not
 *      be claimed by another book (`source_pageid` is UNIQUE).
 *
 * Page lifecycle: a mapped page that is `missing`, has become a redirect, or no
 * longer parses as a book is FLAGGED and its last good row kept — never dropped,
 * never re-pointed. A page whose appearances vanish or collapse is flagged the
 * same way (vandalism / restructuring guard).
 */
import { createHash } from 'node:crypto';
import type { PageEnrichmentContent, StoredAppearances } from './appearances';
import type { PageFetch, RawPage } from './client';
import type { Classification } from './match';

export const WIKI_BASE_URL = 'https://starwars.fandom.com/wiki/';
export const ENRICHMENT_LICENSE = 'CC-BY-SA-3.0';
export const ENRICHMENT_ATTRIBUTION = 'Wookieepedia contributors';

/** A previous row's appearances below this share of its entry count is "shrunk". */
export const SHRINK_RATIO = 0.5;
/** Rows with fewer entries than this are too small for the shrink guard to mean anything. */
export const SHRINK_MIN_ENTRIES = 20;

/** Wiki article URL for a page title (MediaWiki `_` form; `/` and `:` kept literal). */
export function wikiUrl(title: string): string {
	const path = encodeURIComponent(title.replace(/ /g, '_'))
		.replace(/%2F/g, '/')
		.replace(/%3A/g, ':');
	return `${WIKI_BASE_URL}${path}`;
}

// --- Rows + content hash ------------------------------------------------------

/** Every stored column that the content hash covers (all but fetched_at / revid / hash). */
export type EnrichmentContent = {
	source_pageid: number;
	source_title: string;
	source_url: string;
	license: string;
	attribution: string;
	timeline_notes: string | null;
	appearances: StoredAppearances;
};

/** A `book_enrichment` upsert payload. */
export type EnrichmentRow = EnrichmentContent & {
	book_id: string;
	source_revision_id: number | null;
	fetched_at: string;
	content_hash: string;
};

/** JSON with object keys sorted at every level — stable across key insertion order. */
export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

/**
 * sha256 over the normalized stored content only. `fetched_at` and
 * `source_revision_id` are excluded, so a wiki edit to prose we don't store (new
 * revid, same facts) hashes the same and writes nothing. A page move changes
 * `source_title`/`source_url`, which IS stored content, so it does write.
 */
export function contentHash(content: EnrichmentContent): string {
	const normalized: EnrichmentContent = {
		source_pageid: content.source_pageid,
		source_title: content.source_title,
		source_url: content.source_url,
		license: content.license,
		attribution: content.attribution,
		timeline_notes: content.timeline_notes,
		appearances: content.appearances,
	};
	return createHash('sha256').update(canonicalJson(normalized)).digest('hex');
}

export function buildEnrichmentRow(
	bookId: string,
	page: RawPage,
	parsed: PageEnrichmentContent,
	fetchedAt: string,
): EnrichmentRow {
	const content: EnrichmentContent = {
		source_pageid: page.pageid,
		source_title: page.title,
		source_url: wikiUrl(page.title),
		license: ENRICHMENT_LICENSE,
		attribution: ENRICHMENT_ATTRIBUTION,
		timeline_notes: parsed.timeline_notes,
		appearances: parsed.appearances,
	};
	return {
		book_id: bookId,
		...content,
		source_revision_id: page.revid,
		fetched_at: fetchedAt,
		content_hash: contentHash(content),
	};
}

/** Total entries across categories of a stored (or DB-read) `appearances` value. */
export function countEntries(appearances: unknown): number {
	if (appearances === null || typeof appearances !== 'object' || Array.isArray(appearances))
		return 0;
	let n = 0;
	for (const v of Object.values(appearances as Record<string, unknown>)) {
		if (Array.isArray(v)) n += v.length;
	}
	return n;
}

// --- Mapping ------------------------------------------------------------------

export type MapBook = {
	readonly id: string;
	readonly slug: string;
	readonly title: string;
	readonly canon: string;
};

/** The persisted part of an existing row the sync needs. */
export type ExistingRow = {
	readonly book_id: string;
	readonly source_pageid: number;
	readonly source_title: string | null;
	readonly content_hash: string;
	readonly entryCount: number;
};

export type MapTarget = {
	readonly book: MapBook;
	readonly pageid: number;
	readonly origin: 'persisted' | 'discovery';
};

export type MappingIssue = {
	readonly kind:
		| 'synthetic_pageid' // discovery row has no real pageid (sidecar missing)
		| 'pageid_conflict' // same pageid claimed by several books
		| 'multiple_pages' // several discovered pages match one book
		| 'persisted_differs'; // discovery now names another page than the stored row (kept stored)
	readonly slug: string;
	readonly detail: string;
};

export type Mapping = {
	readonly targets: readonly MapTarget[];
	/** Catalog books with no wiki page (no persisted row, no usable match). */
	readonly noPage: readonly MapBook[];
	/** Slugs among `noPage` that appear as an AMBIGUOUS candidate (operator can pin). */
	readonly noPageAmbiguousCandidates: ReadonlySet<string>;
	/** AMBIGUOUS discovery rows (skipped). */
	readonly ambiguous: readonly Classification[];
	readonly issues: readonly MappingIssue[];
};

function byCodeUnit(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export function buildMapping(input: {
	readonly catalog: readonly MapBook[];
	readonly existing: readonly ExistingRow[];
	readonly classifications: readonly Classification[];
	/** Real pageids (discovery sidecar). */
	readonly validPageIds: ReadonlySet<number>;
}): Mapping {
	const bySlug = new Map(input.catalog.map((b) => [b.slug, b]));
	const byId = new Map(input.catalog.map((b) => [b.id, b]));
	const issues: MappingIssue[] = [];
	const targets: MapTarget[] = [];
	const mapped = new Set<string>(); // book ids
	const claimed = new Map<number, string>(); // pageid → book id

	// 1. Persisted rows are the mapping.
	for (const row of input.existing) {
		const book = byId.get(row.book_id);
		if (!book) continue; // FK cascade makes this unreachable; never invent a book
		targets.push({ book, pageid: row.source_pageid, origin: 'persisted' });
		mapped.add(book.id);
		claimed.set(row.source_pageid, book.id);
	}

	// 2. Discovery candidates for the rest (MATCHED / DIFFERS only).
	const candidates = new Map<string, Set<number>>(); // book id → pageids
	for (const c of input.classifications) {
		if ((c.class !== 'MATCHED' && c.class !== 'DIFFERS') || !c.matchSlug) continue;
		const book = bySlug.get(c.matchSlug);
		if (!book) continue;
		const pageid = c.discovered.source_pageid;
		if (!input.validPageIds.has(pageid)) {
			issues.push({
				kind: 'synthetic_pageid',
				slug: book.slug,
				detail: `"${c.discovered.title}" has no real pageid (discovery-meta.json missing/stale)`,
			});
			continue;
		}
		if (mapped.has(book.id)) {
			const stored = targets.find((t) => t.book.id === book.id)?.pageid;
			if (stored !== pageid) {
				issues.push({
					kind: 'persisted_differs',
					slug: book.slug,
					detail: `stored pageid ${stored}, discovery matched ${pageid} ("${c.discovered.title}") — kept stored`,
				});
			}
			continue;
		}
		const set = candidates.get(book.id) ?? new Set<number>();
		set.add(pageid);
		candidates.set(book.id, set);
	}

	// Pageids claimed by more than one unmapped book.
	const claimants = new Map<number, string[]>();
	for (const [bookId, ids] of candidates) {
		for (const id of ids) claimants.set(id, [...(claimants.get(id) ?? []), bookId]);
	}

	for (const [bookId, ids] of candidates) {
		const book = byId.get(bookId) as MapBook;
		if (ids.size > 1) {
			issues.push({
				kind: 'multiple_pages',
				slug: book.slug,
				detail: `matched by pageids ${[...ids].sort((a, b) => a - b).join(', ')} — skipped`,
			});
			continue;
		}
		const pageid = [...ids][0] as number;
		const owner = claimed.get(pageid);
		const rivals = claimants.get(pageid) ?? [];
		if (owner !== undefined || rivals.length > 1) {
			const others = [...(owner ? [owner] : []), ...rivals.filter((r) => r !== bookId)]
				.map((id) => byId.get(id)?.slug ?? id)
				.sort(byCodeUnit);
			issues.push({
				kind: 'pageid_conflict',
				slug: book.slug,
				detail: `pageid ${pageid} also claimed by ${others.join(', ')} — skipped`,
			});
			continue;
		}
		targets.push({ book, pageid, origin: 'discovery' });
		mapped.add(book.id);
	}

	const ambiguous = input.classifications.filter((c) => c.class === 'AMBIGUOUS');
	const ambiguousSlugs = new Set(ambiguous.flatMap((c) => c.candidates));
	const conflicted = new Set(
		issues.filter((i) => i.kind !== 'persisted_differs').map((i) => i.slug),
	);
	const noPage = input.catalog
		.filter((b) => !mapped.has(b.id))
		.sort((a, b) => byCodeUnit(a.slug, b.slug));
	return {
		targets: targets.sort((a, b) => byCodeUnit(a.book.slug, b.book.slug)),
		noPage,
		noPageAmbiguousCandidates: new Set(
			noPage.filter((b) => ambiguousSlugs.has(b.slug) || conflicted.has(b.slug)).map((b) => b.slug),
		),
		ambiguous,
		issues: issues.sort((a, b) => byCodeUnit(a.slug, b.slug) || byCodeUnit(a.kind, b.kind)),
	};
}

// --- Sync plan ----------------------------------------------------------------

export type FlagReason = 'missing' | 'redirect' | 'not_book' | 'emptied' | 'shrunk';

export type SyncStep =
	| {
			readonly kind: 'insert' | 'update';
			readonly book: MapBook;
			readonly row: EnrichmentRow;
			readonly entryCount: number;
			readonly bytes: number;
			/** Title differs from the stored row (page moved). */
			readonly renamed: boolean;
	  }
	| {
			readonly kind: 'unchanged';
			readonly book: MapBook;
			readonly entryCount: number;
			readonly bytes: number;
	  }
	| {
			readonly kind: 'flag';
			readonly book: MapBook;
			readonly pageid: number;
			readonly reason: FlagReason;
			readonly detail: string;
			/** Whether a last good row exists and is being kept. */
			readonly keptExisting: boolean;
	  };

export type PlanOptions = {
	readonly fetchedAt: string;
	/** Accept a large drop in entries (deliberate wiki restructuring). */
	readonly allowShrink?: boolean;
};

/** Serialized size of the upsert payload, for batching and the payload report. */
export function rowBytes(row: EnrichmentRow): number {
	return Buffer.byteLength(JSON.stringify(row), 'utf8');
}

/**
 * Decide one mapped book's step from its fetch + parse. `parse` is injected so
 * this stays testable without wikitext.
 */
export function planStep(
	target: MapTarget,
	fetch: PageFetch,
	existing: ExistingRow | undefined,
	parse: (wikitext: string) => PageEnrichmentContent,
	opts: PlanOptions,
): SyncStep {
	const flag = (reason: FlagReason, detail: string): SyncStep => ({
		kind: 'flag',
		book: target.book,
		pageid: target.pageid,
		reason,
		detail,
		keptExisting: existing !== undefined,
	});
	if (fetch.status === 'missing') return flag('missing', `pageid ${target.pageid} not found`);
	if (fetch.status === 'redirect') {
		return flag(
			'redirect',
			`pageid ${target.pageid} ("${fetch.title}") is now a redirect → ${fetch.target ?? '?'}; re-pin by hand`,
		);
	}
	const parsed = parse(fetch.page.wikitext);
	if (!parsed.hasBookInfobox && parsed.diagnostics.appTemplates === 0) {
		return flag('not_book', `"${fetch.page.title}" has no {{Book}} infobox and no {{App}}`);
	}
	if (existing && existing.entryCount > 0 && parsed.entryCount === 0) {
		return flag('emptied', `appearances went ${existing.entryCount} → 0`);
	}
	if (
		existing &&
		!opts.allowShrink &&
		existing.entryCount >= SHRINK_MIN_ENTRIES &&
		parsed.entryCount < existing.entryCount * SHRINK_RATIO
	) {
		return flag(
			'shrunk',
			`appearances went ${existing.entryCount} → ${parsed.entryCount} (--allow-shrink to accept)`,
		);
	}
	const row = buildEnrichmentRow(target.book.id, fetch.page, parsed, opts.fetchedAt);
	const bytes = rowBytes(row);
	if (existing && existing.content_hash === row.content_hash) {
		return { kind: 'unchanged', book: target.book, entryCount: parsed.entryCount, bytes };
	}
	return {
		kind: existing ? 'update' : 'insert',
		book: target.book,
		row,
		entryCount: parsed.entryCount,
		bytes,
		renamed: existing !== undefined && existing.source_title !== fetch.page.title,
	};
}

/** Group rows into upsert batches by payload size and row count, preserving order. */
export function batchRows<T extends { bytes: number }>(
	items: readonly T[],
	maxBytes = 1_000_000,
	maxRows = 25,
): T[][] {
	const out: T[][] = [];
	let cur: T[] = [];
	let size = 0;
	for (const item of items) {
		if (cur.length && (size + item.bytes > maxBytes || cur.length >= maxRows)) {
			out.push(cur);
			cur = [];
			size = 0;
		}
		cur.push(item);
		size += item.bytes;
	}
	if (cur.length) out.push(cur);
	return out;
}

/**
 * Whether a PostgREST error means `book_enrichment` does not exist on the
 * target (migration not pushed): `PGRST205` (not in schema cache) or `42P01`.
 */
export function isMissingTableError(
	error: { code?: string | null; message?: string | null } | null,
): boolean {
	if (!error) return false;
	if (error.code === 'PGRST205' || error.code === '42P01') return true;
	return (
		/book_enrichment/.test(error.message ?? '') &&
		/does not exist|schema cache/i.test(error.message ?? '')
	);
}
