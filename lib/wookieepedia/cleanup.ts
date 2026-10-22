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
 *     never a Wookieepedia image.
 *   - synopsis: only null/blank, from operator-reviewed drafts
 *     (data/discovery/synopsis-drafts.json), every one marked `drafted`.
 */
import { slugify } from '../slug';
import { type CoverFix, type IsbnState, normalizeIsbnList, sameWork } from './changeset';

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

export type CleanupChangeset = {
	readonly kind: typeof CLEANUP_KIND;
	readonly version: number;
	readonly as_of: string;
	readonly policy: Record<string, string>;
	readonly summary: {
		readonly isbn_fixes: number;
		readonly isbn_flagged: number;
		readonly cover_fills: number;
		readonly covers_missing: number;
		readonly covers_not_yet_available: number;
		readonly synopsis_fills: number;
		readonly synopses_skipped: number;
	};
	readonly isbn_fixes: IsbnMembershipFix[];
	readonly cover_fills: CoverFix[];
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
		'null/blank cover_image only: Open Library (every row ISBN), then Google Books (every row ISBN), then a Google Books title search accepted only when the hit lists a row ISBN; HEAD-checked against MIN_COVER_BYTES, never a cover another row uses, never a Wookieepedia image. Unreleased books without one are listed, not forced.',
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
	const coverFills: CoverFix[] = [];
	const coversMissing: CleanupFlag[] = [];
	const coversNotYet: CleanupFlag[] = [];
	for (const row of rows) {
		if (!isBlank(row.cover_image)) continue;
		const candidates = input.coverCandidates.get(row.slug) ?? [];
		const pick = pickCover(candidates, inUse, row.slug);
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
