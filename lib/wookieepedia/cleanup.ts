import { slugify } from '../slug';
/**
 * Catalog cleanup changeset — a sibling of the Wookieepedia changeset
 * (./changeset.ts) for fixes found AFTER the 2026-10-20 expansion. Pure and
 * DB/network-free: scripts/build-catalog-cleanup.ts fetches the live rows and
 * the OL/GB/wiki evidence and passes them in. Applied by the same engine
 * (scripts/apply-catalog-changeset.ts → ./apply-plan.ts `planCleanup`).
 *
 * Field policy (only fills / additive repairs — nothing curated is removed):
 *   - ISBN: a `primary_isbn` missing from `isbn[]` is ADDED to `isbn[]` when the
 *     evidence says it is this book; if it belongs to another book, `primary_isbn`
 *     is reset to a member of the row's own `isbn[]`. Anything else is flagged.
 *   - covers: only null/blank `cover_image`, from Open Library then Google Books
 *     by the row's own ISBNs, HEAD-checked, never a cover another row uses and
 *     never a Wookieepedia image. When those find nothing for a released book,
 *     a work-level Open Library fallback (`findWorkCover` / `vetFallbackCover`):
 *     the cover of the OL work a row ISBN belongs to, else — only when no row
 *     ISBN is on OL at all — the single work a title + author search returns.
 *     Both require the full title + author-set match and an operator visual
 *     review (`CoverReview`); the image may come from a different printing.
 *   - synopsis: only null/blank, from operator-reviewed drafts
 *     (data/discovery/synopsis-drafts.json), every one marked `drafted`.
 */
import { MIN_COVER_BYTES, findSharedValues } from '../sources/covers';
import { coverByIdUrl } from '../sources/open-library';
import { type CoverFix, type IsbnState, normalizeIsbnList, sameWork } from './changeset';
import { authorSurnameSet } from './match';

export const CLEANUP_KIND = 'catalog-cleanup';
export const CLEANUP_VERSION = 1;

/** Longest synopsis accepted — catalog one-liners run ~40–130 characters. */
export const SYNOPSIS_MAX_CHARS = 160;
/** A drafted synopsis may not share a run this many words long with the wiki page. */
export const SHARED_PHRASE_WORDS = 6;

/** The live `books` columns the cleanup reads. */
export type CleanupRow = {
	readonly id: string;
	readonly slug: string;
	readonly title: string;
	readonly isbn: readonly string[] | null;
	readonly primary_isbn: string | null;
	readonly cover_image: string | null;
	readonly synopsis: string | null;
	readonly date_published: string | null;
	/** Read by the work-level cover fallback (full author-set + canon checks). */
	readonly author?: readonly string[] | null;
	readonly canon?: string | null;
};

/** Open Library's record for one ISBN (edition title/subtitle + work key). */
export type OlEditionFacts = {
	readonly title: string | null;
	readonly subtitle: string | null;
	readonly work: string | null;
};

export type IsbnEvidence = {
	/** The row's Wookieepedia page, when one maps to it. */
	readonly wiki_title: string | null;
	/** ISBNs in the page's infobox (`isbn`, `isbn2`, …), normalized. */
	readonly wiki_infobox_isbns: string[];
	/** Every ISBN-13 that appears anywhere in the page's wikitext. */
	readonly wiki_page_isbns: string[];
	/** OL facts for `primary_isbn` and each member of `isbn[]` (null = no OL record). */
	readonly openlibrary: Readonly<Record<string, OlEditionFacts | null>>;
	/** Other catalog rows whose `isbn[]` or `primary_isbn` holds this `primary_isbn`. */
	readonly other_rows_with_primary: string[];
};

export type IsbnMembershipFix = {
	readonly id: string;
	readonly slug: string;
	readonly title: string;
	/** `add_approved_isbn`: only operator-approved additions (primary_isbn already fine). */
	readonly action: 'add_primary_to_isbn' | 'reset_primary' | 'add_approved_isbn';
	readonly before: IsbnState;
	readonly after: IsbnState;
	readonly reason: string;
	readonly evidence: IsbnEvidence;
	/** Operator-approved ISBNs appended to isbn[] in this same write. */
	readonly approved_additions: ApprovedIsbnAddition[];
	/** Related observations that are NOT changed by this fix. */
	readonly notes: string[];
};

/**
 * An ISBN the operator approved adding to a row's isbn[] (additive only). Each
 * must appear in the row's wiki infobox and be held by no other row, or it is
 * flagged instead of applied.
 */
export type ApprovedIsbnAddition = {
	readonly slug: string;
	readonly isbn: string;
	/** Why it was approved (who/when, and the evidence it rests on). */
	readonly note: string;
};

export type SynopsisFill = {
	readonly id: string;
	readonly slug: string;
	readonly title: string;
	readonly before: string | null;
	readonly after: string;
	/** Always `drafted`: written for this changeset, needs the operator's review. */
	readonly status: 'drafted';
	/** What the draft was written from (never copied prose). */
	readonly basis: string;
	readonly flags: string[];
};

export type CleanupFlag = {
	readonly slug: string;
	readonly title: string;
	readonly reason: string;
};

export type SynopsisDraft = { readonly synopsis: string; readonly basis: string };

/** data/discovery/synopsis-drafts.json */
export type SynopsisDraftFile = {
	readonly drafts: Readonly<Record<string, SynopsisDraft>>;
	/** Rows deliberately left without a draft, with the reason. */
	readonly skipped: Readonly<Record<string, string>>;
};

/** `google-books-search`: a title search hit whose own identifiers include a row ISBN. */
export type CoverSource = 'openlibrary' | 'google-books' | 'google-books-search';

/** One looked-up cover option for a row (url null = the source had none). */
export type CoverCandidate = {
	readonly isbn: string;
	readonly source: CoverSource;
	readonly url: string | null;
	/** Passed the HEAD check (200 + not under MIN_COVER_BYTES). */
	readonly head_ok: boolean;
};

/**
 * Work-level Open Library cover fallback, tried only when every per-ISBN pass
 * found nothing. `same-work`: a row ISBN's OL edition belongs to this work.
 * `title-author`: no row ISBN is on OL; a title + author search returned
 * exactly this one work ("different edition: title+author match").
 */
export type FallbackVia = 'same-work' | 'title-author';

/** An Open Library work as the cover fallback sees it. */
export type OlWorkFacts = {
	/** `/works/OL…W` */
	readonly key: string;
	readonly title: string | null;
	readonly subtitle: string | null;
	/** Author display names (resolved from the work's author keys / search `author_name`). */
	readonly authors: readonly string[];
	/** OL cover ids, work order (non-positive ids are OL's "deleted" markers). */
	readonly covers: readonly number[];
	readonly first_publish_year: number | null;
	/** OL language codes (`eng`, …); empty = unknown. */
	readonly languages: readonly string[];
};

/** Everything the fallback looked up for one row (network-free input). */
export type WorkCoverEvidence = {
	/** Each row ISBN → its OL edition facts (null = no OL edition record). */
	readonly editions: Readonly<Record<string, OlEditionFacts | null>>;
	/** The works those editions point to, by key (null = fetch failed). */
	readonly works: Readonly<Record<string, OlWorkFacts | null>>;
	/** Title + author search hits; null = not searched (some row ISBN is on OL). */
	readonly search: readonly OlWorkFacts[] | null;
};

export type WorkCoverCandidate = {
	readonly via: FallbackVia;
	readonly work: string;
	readonly work_title: string;
	readonly authors: readonly string[];
	readonly first_publish_year: number | null;
	readonly cover_id: number;
	readonly url: string;
	/** The row ISBN whose edition led to the work (same-work only). */
	readonly isbn: string | null;
};

export type WorkCoverDecision =
	| { readonly kind: 'candidate'; readonly candidate: WorkCoverCandidate }
	| { readonly kind: 'none'; readonly reason: string };

/**
 * The operator's visual review of one fallback image (downloaded and looked
 * at: right book, not a placeholder, not a foreign-language edition). A
 * fallback cover is only filled with an `accept` for exactly that image.
 */
export type CoverReview = {
	readonly slug: string;
	/** `coverKey` of the reviewed image, e.g. `ol:8568524`. */
	readonly cover: string;
	readonly verdict: 'accept' | 'reject';
	readonly note: string;
};

/** A cover fill; `fallback` is set when it came from the work-level fallback. */
export type CleanupCoverFill = CoverFix & {
	readonly fallback?: {
		readonly via: FallbackVia;
		readonly work: string;
		readonly review: string;
	};
};

export type CleanupChangeset = {
	readonly kind: typeof CLEANUP_KIND;
	readonly version: number;
	readonly as_of: string;
	readonly policy: Record<string, string>;
	readonly summary: {
		readonly isbn_fixes: number;
		readonly isbn_flagged: number;
		readonly cover_fills: number;
		/** Of `cover_fills`, how many came from the work-level fallback. */
		readonly cover_fills_fallback: number;
		readonly covers_missing: number;
		readonly covers_not_yet_available: number;
		readonly synopsis_fills: number;
		readonly synopses_skipped: number;
	};
	readonly isbn_fixes: IsbnMembershipFix[];
	readonly cover_fills: CleanupCoverFill[];
	readonly synopsis_fills: SynopsisFill[];
	readonly flagged: {
		readonly isbn: CleanupFlag[];
		/** Released books with no usable cover from OL / GB. */
		readonly covers_missing: CleanupFlag[];
		/** Not-yet-released books with no cover yet — expected, not forced. */
		readonly covers_not_yet_available: CleanupFlag[];
		readonly synopses_skipped: CleanupFlag[];
		/** Drafts that were not used (row already has a synopsis / unknown slug). */
		readonly synopsis_drafts_unused: CleanupFlag[];
	};
};

export const CLEANUP_POLICY: Record<string, string> = {
	isbn: "primary_isbn ∉ isbn[]: add primary_isbn to isbn[] when Open Library titles it as this book AND (the wiki lists it OR it is the same OL work as a row ISBN); reset primary_isbn to a row ISBN when the evidence assigns it to another book; flag anything else. Operator-approved additions (listed in the builder, each in the row's wiki infobox and on no other row) are appended in the same write. Never removes an ISBN.",
	covers:
		'null/blank cover_image only: Open Library (every row ISBN), then Google Books (every row ISBN), then a Google Books title search accepted only when the hit lists a row ISBN; HEAD-checked against MIN_COVER_BYTES, never a cover another row uses, never a Wookieepedia image. Only when all of those find nothing for a released book: the cover of the Open Library work a row ISBN belongs to (openlibrary-work), else — only when no row ISBN is on Open Library — the single work an OL title + author search returns (openlibrary-search, "different edition: title+author match"; first published no later than the row, in English, Canon works 2014+). Both need the full normalized title + author-set match, the same HEAD/shared/wiki guards, and an operator visual review of that exact image; they may show a different printing. Unreleased books without one are listed, not forced.',
	synopsis:
		'null/blank synopsis only: original one-line drafts (never wiki CC BY-SA prose or publisher blurbs), each marked drafted for review; rows without a confident draft are skipped and listed.',
};

// --- Small pure helpers --------------------------------------------------------

function byCodeUnit(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function isBlank(v: string | null | undefined): boolean {
	return v == null || v.trim() === '';
}

/** A Wookieepedia/Fandom-hosted image — publisher art used under fair use, never copied. */
export function isWikiImage(url: string): boolean {
	return /(?:^|\/\/|\.)(?:wikia\.nocookie\.net|fandom\.com|starwars\.fandom)/i.test(url);
}

/**
 * Identity of a cover image, so the same picture behind two URL spellings
 * counts as one: an OL cover id, a Google Books volume id, else the URL.
 */
export function coverKey(url: string): string {
	const ol = url.match(/covers\.openlibrary\.org\/b\/id\/(\d+)/);
	if (ol) return `ol:${ol[1]}`;
	const gb = url.match(
		/books\.google\.[a-z.]+\/books\/(?:content|publisher\/content)\?(?:.*&)?id=([\w-]+)/,
	);
	if (gb) return `gb:${gb[1]}`;
	return url.trim();
}

/** Whether an Open Library record names this book (not an edition variant). */
export function olNamesBook(ol: OlEditionFacts | null, rowTitle: string): boolean {
	if (!ol) return false;
	const names = [
		ol.title,
		ol.subtitle,
		ol.title && ol.subtitle ? `${ol.title}: ${ol.subtitle}` : null,
	];
	return names.some((n) => n != null && slugify(n) !== 'star-wars' && sameWork(n, rowTitle));
}

function olLabel(ol: OlEditionFacts | null): string {
	if (!ol) return '—';
	return [ol.title, ol.subtitle].filter(Boolean).join(' / ') || '—';
}

/** The row ISBN to promote when `primary_isbn` has to be reset. */
export function pickResetPrimary(
	own: readonly string[],
	wikiInfobox: readonly string[],
): string | null {
	return own.find((i) => wikiInfobox.includes(i)) ?? own[0] ?? null;
}

// --- ISBN membership -------------------------------------------------------------

export type IsbnDecision =
	| { readonly kind: 'fix'; readonly fix: IsbnMembershipFix }
	| { readonly kind: 'flag'; readonly flag: CleanupFlag };

/**
 * Decide what to do about a row whose `primary_isbn` is not in `isbn[]`, or
 * null when there is nothing to do. Additive first: the ISBN joins `isbn[]`
 * only on positive evidence that it is THIS book. It is reset only when the
 * evidence assigns it elsewhere with nothing pointing back here; mixed or
 * missing evidence is flagged.
 */
export function decideIsbnMembership(row: CleanupRow, ev: IsbnEvidence): IsbnDecision | null {
	const p = row.primary_isbn;
	const own = [...(row.isbn ?? [])];
	if (p == null || own.includes(p)) return null;
	const flag = (reason: string): IsbnDecision => ({
		kind: 'flag',
		flag: { slug: row.slug, title: row.title, reason },
	});

	const olP = ev.openlibrary[p] ?? null;
	const ownWorks = new Set(
		own.map((i) => ev.openlibrary[i]?.work).filter((w): w is string => typeof w === 'string'),
	);
	const olTitleMatch = olNamesBook(olP, row.title);
	const sameOlWork = olP?.work != null && ownWorks.has(olP.work);
	const wikiInfobox = ev.wiki_infobox_isbns.includes(p);
	const wikiListed = wikiInfobox || ev.wiki_page_isbns.includes(p);

	const against: string[] = [];
	if (ev.other_rows_with_primary.length) {
		against.push(`also on ${ev.other_rows_with_primary.map((s) => `"${s}"`).join(', ')}`);
	}
	if (olP && (olP.title || olP.subtitle) && !olTitleMatch) {
		against.push(`Open Library titles ${p} "${olLabel(olP)}"`);
	}
	const forThis: string[] = [];
	if (olTitleMatch) forThis.push(`Open Library titles ${p} "${olLabel(olP)}"`);
	if (wikiInfobox) forThis.push(`the wiki infobox for "${ev.wiki_title}" lists ${p}`);
	else if (wikiListed)
		forThis.push(`the wiki page "${ev.wiki_title}" lists ${p} (not the infobox)`);
	if (sameOlWork)
		forThis.push(`${p} is the same Open Library work (${olP?.work}) as the row's own ISBN`);

	const notes: string[] = [];
	const missingWiki = ev.wiki_infobox_isbns.filter((i) => i !== p && !own.includes(i));
	if (missingWiki.length) {
		notes.push(
			`wiki infobox ISBN ${missingWiki.join(', ')} is not on this row — not added (outside this fix)`,
		);
	}
	if (!wikiListed && ev.wiki_title) {
		notes.push(`${p} does not appear on the wiki page "${ev.wiki_title}"`);
	}

	const before: IsbnState = { isbn: own, primary_isbn: p };
	if (against.length === 0 && olTitleMatch && (wikiListed || sameOlWork)) {
		return {
			kind: 'fix',
			fix: {
				id: row.id,
				slug: row.slug,
				title: row.title,
				action: 'add_primary_to_isbn',
				before,
				after: { isbn: [...own, p], primary_isbn: p },
				reason: `primary_isbn belongs to this book: ${forThis.join('; ')}`,
				evidence: ev,
				approved_additions: [],
				notes,
			},
		};
	}
	if (against.length && forThis.length === 0) {
		const next = pickResetPrimary(own, ev.wiki_infobox_isbns);
		if (!next) {
			return flag(
				`primary_isbn ${p} belongs elsewhere (${against.join('; ')}) and isbn[] is empty — needs a correct ISBN`,
			);
		}
		return {
			kind: 'fix',
			fix: {
				id: row.id,
				slug: row.slug,
				title: row.title,
				action: 'reset_primary',
				before,
				after: { isbn: own, primary_isbn: next },
				reason: `primary_isbn ${p} belongs to another book (${against.join('; ')}); reset to the row's own ${next}`,
				evidence: ev,
				approved_additions: [],
				notes,
			},
		};
	}
	if (against.length) {
		return flag(
			`conflicting evidence for ${p} — for: ${forThis.join('; ')}; against: ${against.join('; ')}`,
		);
	}
	return flag(
		`not enough evidence that ${p} is this book (${forThis.join('; ') || 'no wiki or Open Library support'})`,
	);
}

// --- Covers ----------------------------------------------------------------------

/** Every ISBN on the row (isbn[] then primary_isbn), valid and de-duplicated. */
export function coverIsbns(row: CleanupRow): string[] {
	return normalizeIsbnList([...(row.isbn ?? []), ...(row.primary_isbn ? [row.primary_isbn] : [])]);
}

const SOURCE_ORDER: Readonly<Record<CoverSource, number>> = {
	openlibrary: 0,
	'google-books': 1,
	'google-books-search': 2,
};

/**
 * The cover to fill, from candidates in ISBN order: every Open Library option,
 * then Google Books by ISBN, then the ISBN-verified Google Books title search;
 * it must have passed the HEAD check, not be a
 * wiki image, and not already be used by another row (`inUse`: coverKey → slug).
 */
export function pickCover(
	candidates: readonly CoverCandidate[],
	inUse: ReadonlyMap<string, string>,
	slug: string,
): CoverCandidate | null {
	const ordered = candidates
		.map((c, i) => ({ c, i }))
		.sort((a, b) => SOURCE_ORDER[a.c.source] - SOURCE_ORDER[b.c.source] || a.i - b.i)
		.map((x) => x.c);
	for (const c of ordered) {
		if (!c.url || !c.head_ok || isWikiImage(c.url)) continue;
		const holder = inUse.get(coverKey(c.url));
		if (holder && holder !== slug) continue;
		return c;
	}
	return null;
}

// --- Work-level cover fallback ---------------------------------------------------

/** First year of the Disney canon — a Canon row cannot match an older work. */
export const CANON_START_YEAR = 2014;

/**
 * OL titles separate segments with " - " (or " : ") where the catalog uses
 * ": " — "Star Wars - Last Shot - A Han and Lando Novel". Rewrite them so the
 * shared title normalization (sameWork) sees the same structure.
 */
export function olTitleForm(title: string): string {
	return title
		.replace(/\s+[-–—]\s+/g, ': ')
		.replace(/\s+:\s*/g, ': ')
		.trim();
}

/** Whether an OL work names the row's book: title, subtitle or both, never bare "Star Wars". */
export function olWorkNamesBook(work: OlWorkFacts, rowTitle: string): boolean {
	const t = work.title ? olTitleForm(work.title) : null;
	const s = work.subtitle ? olTitleForm(work.subtitle) : null;
	const names = [t, s, t && s ? `${t}: ${s}` : null];
	return names.some((n) => n != null && slugify(n) !== 'star-wars' && sameWork(n, rowTitle));
}

function sameAuthorSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	return a.size === b.size && [...a].every((x) => b.has(x));
}

function workId(key: string): string {
	return key.replace(/^\/works\//, '');
}

function workLabel(w: OlWorkFacts): string {
	return `${workId(w.key)} "${[w.title, w.subtitle].filter(Boolean).join(' / ') || '—'}"`;
}

/** Why `work` is not this row's book (null = title and full author set match). */
function workMismatch(row: CleanupRow, work: OlWorkFacts, rowAuthors: ReadonlySet<string>) {
	const problems: string[] = [];
	if (!olWorkNamesBook(work, row.title)) problems.push(`title does not match "${row.title}"`);
	if (!sameAuthorSet(authorSurnameSet(work.authors), rowAuthors)) {
		problems.push(
			`authors [${work.authors.join(', ') || '—'}] ≠ row [${(row.author ?? []).join(', ')}]`,
		);
	}
	return problems.length ? problems.join('; ') : null;
}

function firstCover(work: OlWorkFacts): number | null {
	return work.covers.find((c) => Number.isInteger(c) && c > 0) ?? null;
}

/**
 * Identify a work-level Open Library cover for a row the per-ISBN passes left
 * without one. Identity only — the image guards are `vetFallbackCover`.
 *
 *  1. same-work: some row ISBN has an OL edition. Its work must match the row's
 *     normalized title and FULL author set; exactly one such work; its first
 *     cover id.
 *  2. title-author: NO row ISBN is on OL. The title + author search must
 *     return exactly one work matching title + full author set, first
 *     published no later than the row (and, for Canon, no earlier than 2014),
 *     with English among its languages when OL lists any.
 */
export function findWorkCover(row: CleanupRow, ev: WorkCoverEvidence): WorkCoverDecision {
	const none = (reason: string): WorkCoverDecision => ({ kind: 'none', reason });
	const rowAuthors = authorSurnameSet(row.author ?? null);
	if (rowAuthors.size === 0) return none('row has no author to match a work against');
	const candidate = (
		via: FallbackVia,
		work: OlWorkFacts,
		coverId: number,
		isbn: string | null,
	): WorkCoverDecision => ({
		kind: 'candidate',
		candidate: {
			via,
			work: work.key,
			work_title: [work.title, work.subtitle].filter(Boolean).join(' / '),
			authors: work.authors,
			first_publish_year: work.first_publish_year,
			cover_id: coverId,
			url: coverByIdUrl(coverId),
			isbn,
		},
	});

	const isbns = coverIsbns(row);
	const onOl = isbns.filter((i) => ev.editions[i] != null);
	if (onOl.length) {
		const viaIsbn = new Map<string, string>(); // work key → first row ISBN leading to it
		for (const i of onOl) {
			const w = ev.editions[i]?.work;
			if (w && !viaIsbn.has(w)) viaIsbn.set(w, i);
		}
		if (viaIsbn.size === 0) return none(`Open Library has ${onOl.join(', ')} but no work for it`);
		const problems: string[] = [];
		const matches: Array<{ work: OlWorkFacts; isbn: string }> = [];
		for (const [key, isbn] of viaIsbn) {
			const work = ev.works[key] ?? null;
			if (!work) {
				problems.push(`${workId(key)} (via ${isbn}): work record unavailable`);
				continue;
			}
			const why = workMismatch(row, work, rowAuthors);
			if (why) problems.push(`${workLabel(work)} (via ${isbn}): ${why}`);
			else matches.push({ work, isbn });
		}
		if (matches.length === 0) return none(`same-work: ${problems.join('; ')}`);
		if (matches.length > 1) {
			return none(
				`same-work: ambiguous — row ISBNs lead to ${matches.length} matching works (${matches.map((m) => workId(m.work.key)).join(', ')})`,
			);
		}
		const m = matches[0] as (typeof matches)[number];
		const coverId = firstCover(m.work);
		if (coverId == null)
			return none(`same-work: ${workLabel(m.work)} (via ${m.isbn}) has no cover`);
		return candidate('same-work', m.work, coverId, m.isbn);
	}

	if (ev.search == null) return none('no row ISBN on Open Library and no title + author search');
	const hits = new Map<string, OlWorkFacts>();
	for (const w of ev.search) if (!workMismatch(row, w, rowAuthors)) hits.set(w.key, w);
	if (hits.size === 0) {
		return none(
			`title-author: none of ${ev.search.length} Open Library search hit(s) matches the title and full author set`,
		);
	}
	if (hits.size > 1) {
		return none(
			`title-author: ambiguous — ${hits.size} works match (${[...hits.values()].map(workLabel).join(', ')})`,
		);
	}
	const work = [...hits.values()][0] as OlWorkFacts;
	const rowYear = Number.parseInt(row.date_published?.slice(0, 4) ?? '', 10);
	const fpy = work.first_publish_year;
	if (!Number.isFinite(rowYear)) return none('title-author: row has no date to check the work');
	if (fpy == null) return none(`title-author: ${workLabel(work)} has no first-publish year`);
	if (fpy > rowYear) {
		return none(
			`title-author: ${workLabel(work)} first published ${fpy}, after the row (${rowYear})`,
		);
	}
	if (row.canon === 'Canon' && fpy < CANON_START_YEAR) {
		return none(`title-author: ${workLabel(work)} first published ${fpy}, before Canon (2014)`);
	}
	if (work.languages.length && !work.languages.includes('eng')) {
		return none(`title-author: ${workLabel(work)} lists no English edition`);
	}
	const coverId = firstCover(work);
	if (coverId == null) return none(`title-author: ${workLabel(work)} has no cover`);
	return candidate('title-author', work, coverId, null);
}

export type FallbackVet =
	| { readonly ok: true; readonly review: CoverReview }
	| { readonly ok: false; readonly reason: string };

/**
 * The image guards every fallback cover must still pass: the row has no cover,
 * not a wiki image, HEAD-checked (MIN_COVER_BYTES), held by no other row, and
 * an operator `accept` review for exactly this image.
 */
export function vetFallbackCover(
	row: CleanupRow,
	c: WorkCoverCandidate,
	ctx: {
		readonly headOk: boolean;
		/** coverKey → slug of every cover already on a row or reserved by a fill. */
		readonly inUse: ReadonlyMap<string, string>;
		readonly reviews: readonly CoverReview[];
	},
): FallbackVet {
	const no = (reason: string): FallbackVet => ({ ok: false, reason });
	const key = coverKey(c.url);
	if (!isBlank(row.cover_image)) return no('row already has a cover — never overwritten');
	if (isWikiImage(c.url)) return no(`${c.url} is a Wookieepedia image`);
	if (!ctx.headOk)
		return no(`${c.url} failed the HEAD check (< ${MIN_COVER_BYTES} bytes or not 200)`);
	const entries: Array<readonly [string, string]> = [...ctx.inUse]
		.filter(([, slug]) => slug !== row.slug)
		.map(([k, slug]) => [slug, k] as const);
	const holders = findSharedValues([...entries, [row.slug, key] as const]).get(key);
	if (holders)
		return no(`${key} is already used by ${holders.filter((s) => s !== row.slug).join(', ')}`);
	const review = ctx.reviews.find((r) => r.slug === row.slug && r.cover === key);
	if (!review) {
		return no(
			`${c.url} (${key}) is pending visual review — add a CoverReview to accept or reject it`,
		);
	}
	if (review.verdict !== 'accept') return no(`${key} rejected on review: ${review.note}`);
	return { ok: true, review };
}

/** The changeset provenance tag for a fallback fill. */
export function fallbackSource(c: WorkCoverCandidate): string {
	return c.via === 'same-work'
		? `openlibrary-work:${workId(c.work)}`
		: `openlibrary-search:title+author:${workId(c.work)}`;
}

// --- Synopses --------------------------------------------------------------------

/** Shape problems with a drafted synopsis (empty = acceptable). */
export function synopsisProblems(text: string): string[] {
	const s = text.trim();
	const out: string[] = [];
	if (!s) return ['empty'];
	if (s !== text) out.push('leading/trailing whitespace');
	if (/\n/.test(s)) out.push('contains a line break');
	if (s.length > SYNOPSIS_MAX_CHARS)
		out.push(`longer than ${SYNOPSIS_MAX_CHARS} characters (${s.length})`);
	if (!/[.!?]$/.test(s)) out.push('does not end with sentence punctuation');
	if (/[.!?]["”’)]?\s+[A-Z]/.test(s)) out.push('more than one sentence');
	return out;
}

function words(text: string): string[] {
	return (
		text
			.toLowerCase()
			.normalize('NFKD')
			.replace(/\p{Diacritic}/gu, '')
			.replace(/[‘’ʼ]/g, "'")
			.match(/[a-z0-9']+/g) ?? []
	);
}

/**
 * Word runs of length `n` the draft shares with the source prose — a guard
 * against copying or closely paraphrasing wiki / publisher text.
 */
export function sharedPhrases(draft: string, source: string, n = SHARED_PHRASE_WORDS): string[] {
	const src = words(source);
	const grams = new Set<string>();
	for (let i = 0; i + n <= src.length; i++) grams.add(src.slice(i, i + n).join(' '));
	const d = words(draft);
	const out: string[] = [];
	for (let i = 0; i + n <= d.length; i++) {
		const g = d.slice(i, i + n).join(' ');
		if (grams.has(g) && !out.includes(g)) out.push(g);
	}
	return out;
}

// --- Build -----------------------------------------------------------------------

export type CleanupInput = {
	readonly rows: readonly CleanupRow[];
	/** YYYY-MM-DD the build ran — separates unreleased books. */
	readonly asOf: string;
	/** Evidence for rows whose primary_isbn ∉ isbn[], keyed by slug. */
	readonly isbnEvidence: ReadonlyMap<string, IsbnEvidence>;
	/** Looked-up cover options for rows without a cover, keyed by slug. */
	readonly coverCandidates: ReadonlyMap<string, readonly CoverCandidate[]>;
	readonly drafts: SynopsisDraftFile;
	/** Plain wiki page text per slug, for the shared-phrase guard. */
	readonly wikiText: ReadonlyMap<string, string>;
	/** Operator-approved isbn[] additions (evidence for their rows is in `isbnEvidence`). */
	readonly approvedIsbnAdditions: readonly ApprovedIsbnAddition[];
	/** Every catalog row holding each ISBN (isbn[] or primary_isbn). */
	readonly isbnHolders: ReadonlyMap<string, readonly string[]>;
	/** Work-level OL fallback evidence for rows without a cover, keyed by slug. */
	readonly workCovers?: ReadonlyMap<string, WorkCoverEvidence>;
	/** HEAD-check results for fallback cover URLs (url → passed). */
	readonly fallbackHead?: ReadonlyMap<string, boolean>;
	/** Operator visual reviews of fallback covers. */
	readonly coverReviews?: readonly CoverReview[];
};

/**
 * Fold operator-approved additions into the row's ISBN write (one write per
 * row): onto the decided fix when there is one, else a new `add_approved_isbn`
 * fix. An addition is refused (flagged) unless it is a valid ISBN-13 listed in
 * the row's wiki infobox and held by no other row; one already on the row is a
 * no-op.
 */
export function applyApprovedAdditions(
	row: CleanupRow,
	fix: IsbnMembershipFix | null,
	additions: readonly ApprovedIsbnAddition[],
	ev: IsbnEvidence,
	holders: ReadonlyMap<string, readonly string[]>,
): { fix: IsbnMembershipFix | null; flags: CleanupFlag[] } {
	const flags: CleanupFlag[] = [];
	const base: IsbnState = fix
		? fix.after
		: { isbn: [...(row.isbn ?? [])], primary_isbn: row.primary_isbn };
	const isbn = [...base.isbn];
	const accepted: ApprovedIsbnAddition[] = [];
	for (const a of additions) {
		const refuse = (why: string) =>
			flags.push({
				slug: row.slug,
				title: row.title,
				reason: `approved addition ${a.isbn} not applied — ${why}`,
			});
		if (normalizeIsbnList([a.isbn])[0] !== a.isbn) refuse('not a valid ISBN-13');
		else if (!ev.wiki_infobox_isbns.includes(a.isbn)) {
			refuse(`not in the wiki infobox for "${ev.wiki_title ?? '(no wiki page)'}"`);
		} else if ((holders.get(a.isbn) ?? []).some((s) => s !== row.slug)) {
			refuse(`held by ${(holders.get(a.isbn) ?? []).filter((s) => s !== row.slug).join(', ')}`);
		} else if (!isbn.includes(a.isbn)) {
			isbn.push(a.isbn);
			accepted.push(a);
		}
	}
	if (accepted.length === 0) return { fix, flags };
	const added = accepted.map((a) => a.isbn);
	const why = `operator-approved: isbn[] += ${added.join(', ')} (${accepted.map((a) => a.note).join('; ')})`;
	const notes = (fix?.notes ?? []).filter(
		(n) => !added.some((i) => n.includes(`ISBN ${i} is not on this row`)),
	);
	return {
		fix: {
			id: row.id,
			slug: row.slug,
			title: row.title,
			action: fix?.action ?? 'add_approved_isbn',
			before: fix?.before ?? base,
			after: { isbn, primary_isbn: base.primary_isbn },
			reason: fix ? `${fix.reason}; ${why}` : why,
			evidence: fix?.evidence ?? ev,
			approved_additions: [...(fix?.approved_additions ?? []), ...accepted],
			notes,
		},
		flags,
	};
}

function unreleased(row: CleanupRow, asOf: string): boolean {
	return row.date_published != null && row.date_published > asOf;
}

export function buildCleanupChangeset(input: CleanupInput): CleanupChangeset {
	const rows = [...input.rows].sort((a, b) => byCodeUnit(a.slug, b.slug));

	// 1. ISBN membership.
	const isbnFixes: IsbnMembershipFix[] = [];
	const isbnFlags: CleanupFlag[] = [];
	const known = new Set(rows.map((r) => r.slug));
	for (const a of input.approvedIsbnAdditions) {
		if (!known.has(a.slug)) {
			isbnFlags.push({
				slug: a.slug,
				title: '',
				reason: `approved addition ${a.isbn}: no such row`,
			});
		}
	}
	for (const row of rows) {
		const additions = input.approvedIsbnAdditions.filter((a) => a.slug === row.slug);
		const misfiled = row.primary_isbn != null && !(row.isbn ?? []).includes(row.primary_isbn);
		if (!misfiled && additions.length === 0) continue;
		const ev = input.isbnEvidence.get(row.slug);
		if (!ev) {
			isbnFlags.push({ slug: row.slug, title: row.title, reason: 'no evidence gathered' });
			continue;
		}
		let fix: IsbnMembershipFix | null = null;
		const d = misfiled ? decideIsbnMembership(row, ev) : null;
		if (d?.kind === 'fix') fix = d.fix;
		else if (d?.kind === 'flag') isbnFlags.push(d.flag);
		// A flagged row keeps its ISBN state untouched — approvals wait for the flag.
		if (additions.length && d?.kind !== 'flag') {
			const r = applyApprovedAdditions(row, fix, additions, ev, input.isbnHolders);
			fix = r.fix;
			isbnFlags.push(...r.flags);
		}
		if (fix) isbnFixes.push(fix);
	}

	// 2. Cover fills (null/blank only). Rows are visited in slug order, and each
	//    chosen cover is reserved so two fills can never share one.
	const inUse = new Map<string, string>();
	for (const r of rows)
		if (!isBlank(r.cover_image)) inUse.set(coverKey(r.cover_image as string), r.slug);
	const coverFills: CleanupCoverFill[] = [];
	const coversMissing: CleanupFlag[] = [];
	const coversNotYet: CleanupFlag[] = [];
	for (const row of rows) {
		if (!isBlank(row.cover_image)) continue;
		const candidates = input.coverCandidates.get(row.slug) ?? [];
		const pick = pickCover(candidates, inUse, row.slug);
		// Work-level fallback: only once every per-ISBN pass found nothing, released books only.
		let fallbackWhy: string | null = null;
		const workEv = input.workCovers?.get(row.slug);
		if (!pick?.url && workEv && !unreleased(row, input.asOf)) {
			const d = findWorkCover(row, workEv);
			if (d.kind === 'candidate') {
				const c = d.candidate;
				const v = vetFallbackCover(row, c, {
					headOk: input.fallbackHead?.get(c.url) === true,
					inUse,
					reviews: input.coverReviews ?? [],
				});
				if (v.ok) {
					inUse.set(coverKey(c.url), row.slug);
					const how =
						c.via === 'same-work'
							? `Open Library work cover — ${c.isbn}'s edition belongs to ${workId(c.work)} "${c.work_title}" (${c.authors.join(', ')})`
							: `different edition: title+author match — no row ISBN is on Open Library; the search returned only ${workId(c.work)} "${c.work_title}" (${c.authors.join(', ')}, first published ${c.first_publish_year})`;
					coverFills.push({
						id: row.id,
						slug: row.slug,
						title: row.title,
						before: row.cover_image,
						after: c.url,
						source: fallbackSource(c),
						reason: `no cover by ISBN; ${how}; may be a different printing; visual review: ${v.review.note}`,
						fallback: { via: c.via, work: c.work, review: v.review.note },
					});
					continue;
				}
				fallbackWhy = v.reason;
			} else fallbackWhy = d.reason;
		}
		if (pick?.url) {
			inUse.set(coverKey(pick.url), row.slug);
			coverFills.push({
				id: row.id,
				slug: row.slug,
				title: row.title,
				before: row.cover_image,
				after: pick.url,
				source: `${pick.source}:isbn:${pick.isbn}`,
				reason: unreleased(row, input.asOf)
					? `no cover; pre-release cover found via ${pick.source} (not yet released: ${row.date_published})`
					: `no cover; found via ${pick.source}`,
			});
			continue;
		}
		const tried = coverIsbns(row);
		const why = (() => {
			if (tried.length === 0) return 'no ISBN on the row to look up';
			const used = candidates.filter(
				(c) => c.url && c.head_ok && (inUse.get(coverKey(c.url)) ?? row.slug) !== row.slug,
			);
			const failed = candidates.filter((c) => c.url && !c.head_ok).length;
			const parts = [
				`tried ${tried.join(', ')} on Open Library and Google Books (+ ISBN-verified title search)`,
			];
			if (failed) parts.push(`${failed} candidate(s) failed the HEAD check`);
			if (used.length) {
				parts.push(
					`already used by ${[...new Set(used.map((c) => inUse.get(coverKey(c.url as string))))].join(', ')}`,
				);
			}
			if (fallbackWhy) parts.push(`work-level fallback: ${fallbackWhy}`);
			return parts.join('; ');
		})();
		if (unreleased(row, input.asOf)) {
			coversNotYet.push({
				slug: row.slug,
				title: row.title,
				reason: `no cover available yet (releases ${row.date_published}); ${why}`,
			});
		} else {
			coversMissing.push({ slug: row.slug, title: row.title, reason: why });
		}
	}

	// 3. Synopsis fills (null/blank only) from reviewed drafts.
	const synopsisFills: SynopsisFill[] = [];
	const synSkipped: CleanupFlag[] = [];
	const unused: CleanupFlag[] = [];
	const bySlug = new Map(rows.map((r) => [r.slug, r]));
	for (const row of rows) {
		if (!isBlank(row.synopsis)) continue;
		const draft = input.drafts.drafts[row.slug];
		if (!draft) {
			synSkipped.push({
				slug: row.slug,
				title: row.title,
				reason: input.drafts.skipped[row.slug] ?? 'no draft',
			});
			continue;
		}
		const problems = synopsisProblems(draft.synopsis);
		const shared = sharedPhrases(draft.synopsis, input.wikiText.get(row.slug) ?? '');
		if (shared.length) problems.push(`shares wiki phrasing: "${shared.join('", "')}"`);
		if (!input.wikiText.has(row.slug)) problems.push('wiki text unavailable for the copy check');
		if (problems.length) {
			synSkipped.push({
				slug: row.slug,
				title: row.title,
				reason: `draft rejected — ${problems.join('; ')}`,
			});
			continue;
		}
		const flags: string[] = [];
		if (unreleased(row, input.asOf)) {
			flags.push(`not yet released (${row.date_published}) — written from the announced premise`);
		}
		synopsisFills.push({
			id: row.id,
			slug: row.slug,
			title: row.title,
			before: row.synopsis,
			after: draft.synopsis,
			status: 'drafted',
			basis: draft.basis,
			flags,
		});
	}
	for (const slug of Object.keys(input.drafts.drafts).sort(byCodeUnit)) {
		const row = bySlug.get(slug);
		if (!row) unused.push({ slug, title: '', reason: 'no catalog row with this slug' });
		else if (!isBlank(row.synopsis)) {
			unused.push({
				slug,
				title: row.title,
				reason: 'row already has a synopsis — never overwritten',
			});
		}
	}

	return {
		kind: CLEANUP_KIND,
		version: CLEANUP_VERSION,
		as_of: input.asOf,
		policy: CLEANUP_POLICY,
		summary: {
			isbn_fixes: isbnFixes.length,
			isbn_flagged: isbnFlags.length,
			cover_fills: coverFills.length,
			cover_fills_fallback: coverFills.filter((c) => c.fallback).length,
			covers_missing: coversMissing.length,
			covers_not_yet_available: coversNotYet.length,
			synopsis_fills: synopsisFills.length,
			synopses_skipped: synSkipped.length,
		},
		isbn_fixes: isbnFixes,
		cover_fills: coverFills,
		synopsis_fills: synopsisFills,
		flagged: {
			isbn: isbnFlags,
			covers_missing: coversMissing,
			covers_not_yet_available: coversNotYet,
			synopses_skipped: synSkipped,
			synopsis_drafts_unused: unused,
		},
	};
}
