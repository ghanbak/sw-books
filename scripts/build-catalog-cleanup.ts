/**
 * Build the reviewable catalog CLEANUP changeset. READ-ONLY against the
 * database — it never writes to any DB.
 *
 *   npm run catalog:cleanup                                   # vs the PROD catalog (read-only)
 *   npx tsx scripts/build-catalog-cleanup.ts                  # vs the LOCAL catalog
 *   …  --refresh-lookups                                      # ignore the lookup cache
 *   …  --from-backup                                          # rows from data/catalog-backup.csv (no DB)
 *
 * Three repairs (policy: lib/wookieepedia/cleanup.ts):
 *   1. primary_isbn ∉ isbn[] — add it (evidence: wiki infobox/page + Open Library),
 *      or reset primary_isbn when it belongs to another book; else flag. Plus the
 *      operator-approved isbn[] additions, collision removals and invalid-ISBN
 *      removals listed below.
 *   2. null/blank cover_image — Open Library then Google Books by every row ISBN,
 *      then a Google Books title search kept only when the hit lists a row ISBN;
 *      HEAD-checked, never a cover another row uses, never a wiki image. When all
 *      of that finds nothing for a released book: the Open Library WORK cover
 *      (same work as a row ISBN), else — no row ISBN on OL at all — the single
 *      work an OL title + author search returns. Both need a visual review entry
 *      in COVER_FALLBACK_REVIEWS below before they are filled.
 *   3. null/blank synopsis — operator-reviewed original drafts from
 *      data/discovery/synopsis-drafts.json, guarded against shared wiki phrasing.
 *
 * Outputs (deterministic for the same inputs + lookup cache + day):
 *   data/discovery/catalog-cleanup.json  — isbn_fixes / cover_fills / synopsis_fills + flags
 *   data/discovery/catalog-cleanup.md    — human summary
 * Network responses are cached in the gitignored data/discovery/cleanup-cache.json.
 *
 * Apply (dry-run by default) with the shared engine:
 *   npx tsx scripts/apply-catalog-changeset.ts --production --changeset data/discovery/catalog-cleanup.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pLimit from 'p-limit';
import { parseBackup } from '../lib/csv/backup';
import { MIN_COVER_BYTES, headCheckCover } from '../lib/sources/covers';
import { findGbVolumeByTitleWithIsbn, lookupCandidatesFor } from '../lib/sources/lookup';
import {
	fetchAuthor,
	fetchByIsbn,
	fetchWork,
	searchByTitleAuthor,
} from '../lib/sources/open-library';
import { normalizeIsbnList } from '../lib/wookieepedia/changeset';
import {
	type ApprovedIsbnAddition,
	type ApprovedIsbnRemoval,
	type CleanupChangeset,
	type CleanupFlag,
	type CleanupRow,
	type CoverCandidate,
	type CoverReview,
	type InvalidIsbnRemoval,
	type IsbnEvidence,
	type OlEditionFacts,
	type OlWorkFacts,
	type SynopsisDraftFile,
	type WorkCoverEvidence,
	buildCleanupChangeset,
	coverIsbns,
	findWorkCover,
	isWikiImage,
} from '../lib/wookieepedia/cleanup';
import { fetchPagesByIds } from '../lib/wookieepedia/client';
import { type CatalogBook, createTitleIndex } from '../lib/wookieepedia/match';
import { parseBookInfobox, stripWikiMarkup } from '../lib/wookieepedia/parse';
import { makeClient, productionEnv } from './_supabase';
import { loadDiscovered } from './lib/load-discovered';

const ROOT = resolve(__dirname, '..');
const DIR = resolve(ROOT, 'data', 'discovery');
const OUT_JSON = resolve(DIR, 'catalog-cleanup.json');
const OUT_MD = resolve(DIR, 'catalog-cleanup.md');
const DRAFTS = resolve(DIR, 'synopsis-drafts.json');
const CACHE = resolve(DIR, 'cleanup-cache.json');

/**
 * isbn[] additions the operator reviewed and approved (additive only — never
 * moves primary_isbn). Each is re-verified on every build: it must be in the
 * row's wiki infobox and on no other row, else it is flagged, not applied.
 */
const APPROVED_ISBN_ADDITIONS: readonly ApprovedIsbnAddition[] = [
	{
		slug: 'shadow-of-the-sith',
		isbn: '9780593358603',
		note: 'approved 2026-10-21 — the Wookieepedia infobox ISBN for "Shadow of the Sith" (Del Rey US hardcover; Open Library: same work); removed from brotherhood by the 2026-10-20 changeset and on no row since',
	},
	{
		slug: 'aftermath-life-debt',
		isbn: '9781101966938',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey US hardcover, July 12 2016); Open Library: "Star Wars: Aftermath: Life debt", Chuck Wendig, Del Rey',
	},
	{
		slug: 'acolyte-crystal-crown',
		isbn: '9781368070126',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Disney–Lucasfilm Press hardcover, July 29 2025); Open Library: "Star Wars: the Acolyte: the Crystal Crown", Tessa Gratton',
	},
	{
		slug: 'acolyte-wayseeker',
		isbn: '9780593874431',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, May 6 2025); penguinrandomhouse.com lists it as "The Acolyte: Wayseeker" by Justina Ireland; not on Open Library',
	},
	{
		slug: 'corellian-trilogy-ambush',
		isbn: '9780553298031',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra US paperback, Feb 2 1995); Open Library: "Star Wars: Ambush at Corellia", Roger MacBride Allen, Spectra',
	},
	{
		slug: 'defy-the-storm',
		isbn: '9781368093811',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Disney–Lucasfilm Press US hardcover, Mar 5 2024); Open Library: "Defy the Storm: Star Wars: The High Republic", Tessa Gratton + Justina Ireland',
	},
	{
		slug: 'hand-of-thrawn-vision',
		isbn: '9780553100358',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra US hardcover, Sep 1998); Open Library: "Star Wars: Vision of the Future", Timothy Zahn, Bantam',
	},
	{
		slug: 'mace-windu-glass-abyss',
		isbn: '9780593723432',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, Oct 15 2024); Open Library: "Mace Windu: The Glass Abyss: Star Wars", Steven Barnes',
	},
	{
		slug: 'njo-force-heretic-reunion',
		isbn: '9780345428721',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey paperback, July 2003); Open Library: "Reunion", Ballantine Books 2003',
	},
	{
		slug: 'reign-of-the-empire-mask-of-fear',
		isbn: '9780593723463',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, Feb 25 2025); Open Library: "Reign of the Empire: The Mask of Fear", Alexander Freed',
	},
	{
		slug: 'temptation-of-the-force',
		isbn: '9780593723098',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, June 11 2024); Open Library: "Temptation of the Force: Star Wars: The High Republic", Tessa Gratton',
	},
	{
		slug: 'the-living-force',
		isbn: '9780593597958',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, Apr 9 2024); Open Library: "The Living Force: Star Wars", John Jackson Miller',
	},
	{
		slug: 'thrawn-ascendancy-chaos-rising',
		isbn: '9780593157688',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey US hardcover, Sep 1 2020); Open Library: "Chaos Rising: Star Wars: Thrawn Ascendancy, Book 1", Timothy Zahn, hardcover',
	},
	{
		slug: 'thrawn-ascendancy-greater-good',
		isbn: '9780593158296',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey US hardcover, Apr 27 2021); Open Library: "Greater Good: Star Wars: Thrawn Ascendancy, Book 2", Timothy Zahn, hardcover',
	},
	{
		slug: 'trials-of-the-jedi',
		isbn: '9780593723524',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, June 17 2025); penguinrandomhouse.com resolves it to "Trials of the Jedi" by Charles Soule; not on Open Library',
	},
	{
		slug: 'x-wing-bacta-war',
		isbn: '9780553568042',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra paperback, Feb 1997); Open Library: "Star Wars: The Bacta War: X-Wing Book 4", Michael A. Stackpole',
	},
	{
		slug: 'x-wing-iron-fist',
		isbn: '9780553578973',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox ISBN-10 0553578979 (Bantam Spectra paperback, July 1998); Open Library: "Star Wars: Iron Fist: X-Wing Book 6", Aaron Allston',
	},
	{
		slug: 'x-wing-krytos-trap',
		isbn: '9780553568035',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra paperback, Oct 1996); Open Library: "Star Wars: The Krytos Trap: X-Wing - Book 3", Michael A. Stackpole',
	},
	{
		slug: 'x-wing-solo-command',
		isbn: '9780553579000',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra US paperback, Feb 2 1999); Open Library: "Star Wars: Solo Command: X-Wing - Book 7", Aaron Allston',
	},
	{
		slug: 'x-wing-wedges-gamble',
		isbn: '9780553568028',
		note: '2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra paperback, May 1996); Open Library: "Star Wars: Wedge\'s Gamble: X-Wing - Book 2", Michael A. Stackpole',
	},
];

/**
 * Collision removals the operator reviewed and approved: an ISBN two rows share
 * is dropped from the row it does not belong to. Re-verified on every build —
 * the owner must still hold it, it must not be the row's primary_isbn, and
 * Open Library must not title it as this row's book — else flagged.
 */
const APPROVED_ISBN_REMOVALS: readonly ApprovedIsbnRemoval[] = [
	{
		slug: 'queens-peril',
		isbn: '9781368057943',
		owner: 'queens-shadow',
		note: "2026-11-06 (#78, approved on merge) — Open Library titles 9781368057943 \"Queen's Shadow\" (Disney Lucasfilm Press, 2020 paperback); it is queens-shadow's primary_isbn, so a scan could return Queen's Peril",
	},
];

/**
 * Invalid ISBN-13s (bad check digit) the operator approved removing (#86):
 * `normalizeIsbn` rejects them, so a scan never matches. Recomputing the check
 * digit is not a fix — each recomputed value is a different book on Open
 * Library (e.g. 9780553570052 = Sweet Valley "Elizabeth's Secret Diary"). Where
 * the bad value is the primary, primary_isbn moves to the row's verified
 * edition ISBN (an approved addition above, so it lands in the same write).
 * Re-verified on every build: the value must fail the check digit, and the
 * replacement must be valid and on the row.
 */
const INVALID_ISBN_REMOVALS: readonly InvalidIsbnRemoval[] = [
	{
		slug: 'x-wing-wedges-gamble',
		isbn: '9780553570050',
		primary: '9780553568028',
		note: '2026-11-07 (#86) — bad check digit; recomputed 9780553570052 is Sweet Valley "Elizabeth\'s Secret Diary" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: Wedge\'s Gamble")',
	},
	{
		slug: 'x-wing-krytos-trap',
		isbn: '9780553570067',
		primary: '9780553568035',
		note: '2026-11-07 (#86) — bad check digit; recomputed 9780553570069 is Sweet Valley "Busted!" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: The Krytos Trap")',
	},
	{
		slug: 'x-wing-bacta-war',
		isbn: '9780553570074',
		primary: '9780553568042',
		note: '2026-11-07 (#86) — bad check digit; recomputed 9780553570076 is Sweet Valley "The Trial of Jessica Wakefield" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: The Bacta War")',
	},
	{
		slug: 'x-wing-iron-fist',
		isbn: '9780553570098',
		primary: '9780553578973',
		note: '2026-11-07 (#86) — bad check digit; recomputed 9780553570090 is "Running for Her Life" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: Iron Fist")',
	},
	{
		slug: 'x-wing-solo-command',
		isbn: '9780553570104',
		primary: '9780553579000',
		note: '2026-11-07 (#86) — bad check digit; recomputed 9780553570106 is Sweet Valley "The Roommate" on Open Library. Primary → Spectra PB (OL: "Star Wars: Solo Command")',
	},
	{
		slug: 'corellian-trilogy-ambush',
		isbn: '9780553572832',
		primary: '9780553298031',
		note: '2026-11-07 (#86) — bad check digit; recomputed 9780553572834 is "Buffalo Palace" on Open Library. Primary → Spectra PB (OL: "Star Wars: Ambush at Corellia")',
	},
	{
		slug: 'hand-of-thrawn-vision',
		isbn: '9780553572993',
		primary: '9780553100358',
		note: '2026-11-07 (#86) — bad check digit; recomputed 9780553572995 is "The Alienist" on Open Library. Primary → Bantam US HC (OL: "Star Wars: Vision of the Future")',
	},
	{
		slug: 'acolyte-crystal-crown',
		isbn: '9781368099123',
		note: '2026-11-07 (#86) — bad check digit (extra isbn[] entry); recomputed 9781368099127 has no Open Library record, so nothing is added',
	},
	{
		slug: 'heir-to-the-empire',
		isbn: '9780345528295',
		note: '2026-11-07 (#86) — bad check digit (extra isbn[] entry); recomputed 9780345528292 (OL: "Heir to the Empire", Lucas Books 2011) is already on the row',
	},
	{
		slug: 'njo-final-prophecy',
		isbn: '9780345428757',
		note: '2026-11-07 (#86) — bad check digit (extra isbn[] entry); recomputed 9780345428752 (OL: "Star Wars: The Final Prophecy", Del Rey 2003) is already on the row',
	},
];

/**
 * Visual reviews of work-level fallback covers (lib/wookieepedia/cleanup.ts
 * `vetFallbackCover`): each image was downloaded and looked at — right book,
 * English, not a placeholder. A fallback cover with no `accept` here is listed
 * as pending, never filled. Keyed by slug + coverKey, so a different image for
 * the same row needs its own review.
 */
const COVER_FALLBACK_REVIEWS: readonly CoverReview[] = [
	{
		slug: 'children-of-the-jedi',
		cover: 'ol:372419',
		verdict: 'accept',
		note: '2026-10-22 — downloaded 276×475 JPEG of the English Bantam Spectra mass-market cover ("Star Wars / Children of the Jedi / Barbara Hambly"); not a placeholder or a foreign edition',
	},
	{
		slug: 'last-shot',
		cover: 'ol:8568524',
		verdict: 'accept',
		note: '2026-10-22 — downloaded 279×500 JPEG of the English Del Rey cover ("Star Wars / Last Shot / A Han and Lando Novel / Daniel José Older"); likely the later paperback printing (bestseller banner + review quote), not a placeholder or a foreign edition',
	},
];

const PROD = process.argv.includes('--production');
/** Build from the committed prod snapshot instead of a live read (offline, no credentials). */
const FROM_BACKUP = process.argv.includes('--from-backup');
const BACKUP = resolve(ROOT, 'data', 'catalog-backup.csv');
const REFRESH = process.argv.includes('--refresh-lookups');

// --- Cache -----------------------------------------------------------------------

type WikiFacts = {
	readonly pageid: number;
	readonly title: string;
	readonly infobox_isbns: string[];
	readonly page_isbns: string[];
	readonly text: string;
};

type Cache = {
	wiki: Record<string, WikiFacts | null>;
	ol: Record<string, OlEditionFacts | null>;
	covers: Record<string, { ol: string | null; gb: string | null }>;
	/** Per slug: the ISBN-verified Google Books title-search hit (null = none). */
	gbSearch: Record<string, { isbn: string; volumeId: string; cover_image: string | null } | null>;
	head: Record<string, boolean>;
	/** OL work records by key (author keys unresolved; null = fetch failed). */
	olWorks: Record<string, OlWorkRecord | null>;
	/** OL author display names by key. */
	olAuthors: Record<string, string | null>;
	/** Per slug: OL title + author search hits (only for rows with no ISBN on OL). */
	olSearch: Record<string, OlWorkFacts[] | null>;
};

type OlWorkRecord = {
	readonly title: string | null;
	readonly subtitle: string | null;
	readonly author_keys: string[];
	readonly covers: number[];
	readonly first_publish_year: number | null;
};

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
	return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function loadCache(): Cache {
	const empty: Cache = {
		wiki: {},
		ol: {},
		covers: {},
		gbSearch: {},
		head: {},
		olWorks: {},
		olAuthors: {},
		olSearch: {},
	};
	if (REFRESH || !existsSync(CACHE)) return empty;
	try {
		return { ...empty, ...(JSON.parse(readFileSync(CACHE, 'utf-8')) as Partial<Cache>) };
	} catch {
		return empty;
	}
}

function saveCache(c: Cache): void {
	const out = {
		wiki: sortKeys(c.wiki),
		ol: sortKeys(c.ol),
		covers: sortKeys(c.covers),
		gbSearch: sortKeys(c.gbSearch),
		head: sortKeys(c.head),
		olWorks: sortKeys(c.olWorks),
		olAuthors: sortKeys(c.olAuthors),
		olSearch: sortKeys(c.olSearch),
	};
	writeFileSync(CACHE, `${JSON.stringify(out, null, 2)}\n`);
}

// --- Lookups (network, read-only) --------------------------------------------------

/**
 * Each catalog row's Wookieepedia page id: the changeset's title + author +
 * canon identity, else an exact, unique title match (rows inserted from the
 * wiki carry its title verbatim even when an editor credit was dropped).
 */
function wikiPageIds(catalog: readonly CatalogBook[]): Map<string, number> {
	const discovered = loadDiscovered();
	const owner = createTitleIndex(catalog);
	const out = new Map<string, number>();
	const clash = new Set<string>();
	for (const d of discovered) {
		const o = owner(d);
		if (!o) continue;
		if (out.has(o.slug) && out.get(o.slug) !== d.source_pageid) clash.add(o.slug);
		out.set(o.slug, d.source_pageid);
	}
	for (const s of clash) out.delete(s); // several pages name the row — no single source
	for (const c of catalog) {
		if (out.has(c.slug) || clash.has(c.slug)) continue;
		const same = discovered.filter((d) => d.title === c.title && d.canon === c.canon);
		if (same.length === 1) out.set(c.slug, (same[0] as (typeof same)[number]).source_pageid);
	}
	return out;
}

async function fetchWiki(slugs: readonly string[], ids: Map<string, number>, cache: Cache) {
	const missing = slugs.filter((s) => !(s in cache.wiki));
	const want = new Map<number, string>();
	for (const s of missing) {
		const id = ids.get(s);
		if (id != null) want.set(id, s);
		else cache.wiki[s] = null;
	}
	if (want.size === 0) return;
	for (const f of await fetchPagesByIds([...want.keys()])) {
		const slug = f.status === 'ok' ? want.get(f.page.pageid) : undefined;
		if (f.status !== 'ok' || !slug) continue;
		const box = parseBookInfobox(f.page.wikitext) ?? {};
		const infobox = normalizeIsbnList(
			Object.entries(box)
				.filter(([k]) => /^isbn\d*$/i.test(k))
				.map(([, v]) => stripWikiMarkup(v)),
		);
		const mentioned = f.page.wikitext.match(/\b97[89][\d-]{10,14}\b/g) ?? [];
		cache.wiki[slug] = {
			pageid: f.page.pageid,
			title: f.page.title,
			infobox_isbns: infobox,
			page_isbns: normalizeIsbnList(mentioned).sort(),
			text: stripWikiMarkup(f.page.wikitext),
		};
	}
	for (const s of missing) if (!(s in cache.wiki)) cache.wiki[s] = null;
}

type OlEdition = { title?: string; subtitle?: string; works?: Array<{ key?: string }> };

async function olFacts(isbn: string): Promise<OlEditionFacts | null> {
	const e = await fetchByIsbn<OlEdition>(isbn);
	if (!e) return null;
	return { title: e.title ?? null, subtitle: e.subtitle ?? null, work: e.works?.[0]?.key ?? null };
}

type OlWorkJson = {
	title?: string;
	subtitle?: string;
	authors?: Array<{ author?: { key?: string } }>;
	covers?: number[];
	first_publish_date?: string;
};

async function olWork(key: string): Promise<OlWorkRecord | null> {
	const w = await fetchWork<OlWorkJson>(key);
	if (!w) return null;
	const year = w.first_publish_date?.match(/\b(\d{4})\b/)?.[1];
	return {
		title: w.title ?? null,
		subtitle: w.subtitle ?? null,
		author_keys: (w.authors ?? []).map((a) => a.author?.key).filter((k): k is string => !!k),
		covers: (w.covers ?? []).filter((c) => Number.isInteger(c)),
		first_publish_year: year ? Number(year) : null,
	};
}

type OlSearchJson = {
	docs?: Array<{
		key?: string;
		title?: string;
		subtitle?: string;
		author_name?: string[];
		cover_i?: number;
		first_publish_year?: number;
		language?: string[];
	}>;
};

/** OL title + author search → work facts (search docs are works). */
async function olSearchWorks(title: string, author: string): Promise<OlWorkFacts[] | null> {
	const res = await searchByTitleAuthor<OlSearchJson>(title, author, {
		limit: 10,
		fields: 'key,title,subtitle,author_name,cover_i,first_publish_year,language',
	});
	if (!res) return null;
	return (res.docs ?? [])
		.filter((d) => typeof d.key === 'string')
		.map((d) => ({
			key: d.key as string,
			title: d.title ?? null,
			subtitle: d.subtitle ?? null,
			authors: d.author_name ?? [],
			covers: d.cover_i ? [d.cover_i] : [],
			first_publish_year: d.first_publish_year ?? null,
			languages: [...(d.language ?? [])].sort(),
		}));
}

// --- Summary ---------------------------------------------------------------------

function flagLines(L: string[], heading: string, flags: readonly CleanupFlag[], blurb?: string) {
	if (!flags.length) return;
	L.push('', `## ${heading}`, '');
	if (blurb) L.push(blurb, '');
	for (const f of flags) L.push(`- \`${f.slug}\`${f.title ? ` (*${f.title}*)` : ''}: ${f.reason}`);
}

const ACTION_LABEL: Record<CleanupChangeset['isbn_fixes'][number]['action'], string> = {
	add_primary_to_isbn: 'add primary_isbn to isbn[]',
	reset_primary: 'reset primary_isbn',
	add_approved_isbn: 'operator-approved isbn[] addition',
	remove_approved_isbn: 'operator-approved collision removal',
	remove_invalid_isbn: 'operator-approved invalid-ISBN removal',
};

function summaryMarkdown(cs: CleanupChangeset, catalogRows: number, label: string): string {
	const L: string[] = [];
	const s = cs.summary;
	L.push('# Catalog cleanup changeset', '');
	L.push(`Built ${cs.as_of} against the ${label} catalog (${catalogRows} rows), read-only.`);
	L.push(
		'Apply (dry-run first): `npx tsx scripts/apply-catalog-changeset.ts --production --changeset data/discovery/catalog-cleanup.json`',
		'',
	);
	L.push('| Section | Count |', '| --- | --- |');
	L.push(`| ISBN repairs (primary_isbn ∉ isbn[]) | ${s.isbn_fixes} (flagged: ${s.isbn_flagged}) |`);
	L.push(`| Cover fills (null cover_image) | ${s.cover_fills} |`);
	L.push(
		`| … of which work-level fallback (may be a different printing) | ${s.cover_fills_fallback} |`,
	);
	L.push(`| Covers still missing (released) | ${s.covers_missing} |`);
	L.push(`| No cover available yet (unreleased) | ${s.covers_not_yet_available} |`);
	L.push(`| Synopsis fills — **drafted, review each** | ${s.synopsis_fills} |`);
	L.push(`| Synopses skipped | ${s.synopses_skipped} |`, '');

	L.push('## ISBN repairs', '');
	for (const f of cs.isbn_fixes) {
		const e = f.evidence;
		L.push(
			`### \`${f.slug}\` — ${ACTION_LABEL[f.action]}${f.approved_additions.length && f.action !== 'add_approved_isbn' ? ' + approved addition' : ''}`,
			'',
		);
		L.push(
			`- before: isbn [${f.before.isbn.join(', ')}] · primary ${f.before.primary_isbn ?? '∅'}`,
			`- after: isbn [${f.after.isbn.join(', ')}] · primary ${f.after.primary_isbn ?? '∅'}`,
			`- why: ${f.reason}`,
			`- wiki: ${e.wiki_title ? `*${e.wiki_title}* — infobox [${e.wiki_infobox_isbns.join(', ')}]; page lists [${e.wiki_page_isbns.join(', ')}]` : 'no wiki page mapped'}`,
		);
		for (const [isbn, ol] of Object.entries(e.openlibrary)) {
			L.push(
				`- Open Library ${isbn}: ${ol ? `"${[ol.title, ol.subtitle].filter(Boolean).join(' / ')}" (${ol.work ?? 'no work'})` : 'no record'}`,
			);
		}
		L.push(
			`- other rows holding ${f.before.primary_isbn}: ${e.other_rows_with_primary.length ? e.other_rows_with_primary.join(', ') : 'none'}`,
		);
		for (const a of f.approved_additions)
			L.push(`- operator-approved addition ${a.isbn}: ${a.note}`);
		for (const r of f.approved_removals ?? [])
			L.push(`- operator-approved removal ${r.isbn} (owner \`${r.owner}\`): ${r.note}`);
		for (const r of f.invalid_removals ?? [])
			L.push(
				`- invalid-ISBN removal ${r.isbn}${r.primary ? ` (primary → ${r.primary})` : ''}: ${r.note}`,
			);
		for (const n of f.notes) L.push(`- note: ${n}`);
		L.push('');
	}
	flagLines(L, 'Flagged ISBN rows (not changed)', cs.flagged.isbn);

	L.push('', '## Cover fills (cover_image was null)', '');
	for (const c of cs.cover_fills.filter((f) => !f.fallback)) {
		L.push(`- \`${c.slug}\`: ${c.after} (${c.source}) — ${c.reason}`);
	}
	const fallback = cs.cover_fills.filter((f) => f.fallback);
	if (fallback.length) {
		L.push(
			'',
			'### Work-level Open Library fallback — review each',
			'',
			'No per-ISBN source had a cover, so these come from the Open Library **work** (all printings of the book), not the row’s own ISBN. The image may show a different printing (paperback vs. hardcover, a reissue). Each was downloaded and visually reviewed (note below); `openlibrary-search` fills are a **different edition: title+author match** — no row ISBN is on Open Library.',
			'',
		);
		for (const c of fallback) {
			const tag =
				c.fallback?.via === 'title-author'
					? '**different edition: title+author match**'
					: 'same OL work as a row ISBN';
			L.push(`- \`${c.slug}\` — ${tag}: ${c.after} (\`${c.source}\`) — ${c.reason}`);
		}
	}
	flagLines(L, 'Covers still missing', cs.flagged.covers_missing);
	flagLines(
		L,
		'No cover available yet',
		cs.flagged.covers_not_yet_available,
		'Not released yet — left null rather than forcing a cover.',
	);

	L.push(
		'',
		'## Drafted synopses (synopsis was null)',
		'',
		'Every line below is an original **draft** (status `drafted`) written from the facts of the book — not wiki or publisher prose. Review and edit before applying.',
		'',
		'| Slug | Draft | Notes |',
		'| --- | --- | --- |',
	);
	for (const f of cs.synopsis_fills) {
		const cell = (t: string) => t.replace(/\|/g, '\\|');
		L.push(`| \`${f.slug}\` | ${cell(f.after)} | ${cell([f.basis, ...f.flags].join('; '))} |`);
	}
	flagLines(L, 'Synopses skipped', cs.flagged.synopses_skipped);
	flagLines(L, 'Unused drafts', cs.flagged.synopsis_drafts_unused);
	L.push('');
	return L.join('\n');
}

// --- Main ------------------------------------------------------------------------

async function main(): Promise<void> {
	if (!process.env.GOOGLE_BOOKS_API_KEY) {
		const key = productionEnv().GOOGLE_BOOKS_API_KEY;
		if (key) process.env.GOOGLE_BOOKS_API_KEY = key;
	}
	let data: unknown[];
	if (FROM_BACKUP) {
		data = parseBackup(readFileSync(BACKUP, 'utf-8')).sort((a, b) =>
			a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0,
		);
	} else {
		const supabase = makeClient(PROD);
		const res = await supabase.from('books').select('*').order('slug');
		if (res.error) throw new Error(`catalog read failed: ${res.error.message}`);
		data = res.data ?? [];
	}
	const catalog = data as unknown as Array<CatalogBook & CleanupRow>;
	const label = FROM_BACKUP
		? 'PRODUCTION-snapshot (data/catalog-backup.csv)'
		: PROD
			? 'PRODUCTION'
			: 'LOCAL';
	console.log(`Catalog: ${label}, ${catalog.length} rows (read-only).`);

	const drafts = JSON.parse(readFileSync(DRAFTS, 'utf-8')) as SynopsisDraftFile;
	const cache = loadCache();
	const limit = pLimit(3);
	const blank = (v: string | null) => v == null || v.trim() === '';

	const isbnRows = catalog.filter(
		(r) => r.primary_isbn != null && !(r.isbn ?? []).includes(r.primary_isbn),
	);
	const approvedSlugs = new Set(
		[...APPROVED_ISBN_ADDITIONS, ...APPROVED_ISBN_REMOVALS, ...INVALID_ISBN_REMOVALS].map(
			(a) => a.slug,
		),
	);
	const evidenceRows = catalog.filter((r) => isbnRows.includes(r) || approvedSlugs.has(r.slug));
	const coverRows = catalog.filter((r) => blank(r.cover_image));
	const synopsisRows = catalog.filter((r) => blank(r.synopsis));
	console.log(
		`primary_isbn ∉ isbn[]: ${isbnRows.length} · no cover: ${coverRows.length} · no synopsis: ${synopsisRows.length}`,
	);

	// 1. Wiki pages (ISBN evidence + the synopsis copy check).
	const ids = wikiPageIds(catalog);
	await fetchWiki(
		[...new Set([...evidenceRows, ...synopsisRows].map((r) => r.slug))].sort(),
		ids,
		cache,
	);

	// 2. Open Library facts for each problem primary_isbn, approved addition, and row ISBN.
	const olIsbnsOf = (r: CleanupRow) => [
		...new Set([
			...(r.primary_isbn ? [r.primary_isbn] : []),
			...(r.isbn ?? []),
			...APPROVED_ISBN_ADDITIONS.filter((a) => a.slug === r.slug).map((a) => a.isbn),
		]),
	];
	const olIsbns = new Set(evidenceRows.flatMap(olIsbnsOf));
	await Promise.all(
		[...olIsbns].map((i) =>
			limit(async () => {
				if (!(i in cache.ol)) cache.ol[i] = await olFacts(i);
			}),
		),
	);

	// 3. Cover candidates: every row ISBN on OL + GB (the admin lookup), HEAD-checked.
	await Promise.all(
		coverRows.flatMap((r) =>
			coverIsbns(r).map((isbn) =>
				limit(async () => {
					if (!(isbn in cache.covers)) {
						const res = await lookupCandidatesFor({
							isbn,
							title: r.title,
							author: r.author?.[0] ?? '',
						});
						cache.covers[isbn] = {
							ol: res.ol.cover_image ?? null,
							gb: res.gb.cover_image ?? null,
						};
					}
				}),
			),
		),
	);
	await Promise.all(
		coverRows.map((r) =>
			limit(async () => {
				const isbns = coverIsbns(r);
				if (isbns.length && !(r.slug in cache.gbSearch)) {
					cache.gbSearch[r.slug] = await findGbVolumeByTitleWithIsbn({
						isbns,
						title: r.title,
						author: r.author?.[0] ?? '',
					});
				}
			}),
		),
	);
	const urls = new Set(
		[
			...Object.values(cache.covers).flatMap((c) => [c.ol, c.gb]),
			...Object.values(cache.gbSearch).map((g) => g?.cover_image ?? null),
		].filter((u): u is string => !!u),
	);
	const headCheck = (u: string) =>
		limit(async () => {
			if (!(u in cache.head))
				cache.head[u] = await headCheckCover(u, { minBytes: MIN_COVER_BYTES });
		});
	await Promise.all([...urls].map(headCheck));

	// 4. Work-level OL fallback evidence — only for released rows whose per-ISBN
	//    passes produced no usable image (the pure build still runs it last).
	const asOf = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
	const usable = (u: string | null) => !!u && cache.head[u] === true && !isWikiImage(u);
	const fallbackRows = coverRows.filter((r) => {
		if (r.date_published != null && r.date_published > asOf) return false;
		const isbns = coverIsbns(r);
		const perIsbn = isbns.flatMap((i) => [
			cache.covers[i]?.ol ?? null,
			cache.covers[i]?.gb ?? null,
		]);
		return ![...perIsbn, cache.gbSearch[r.slug]?.cover_image ?? null].some(usable);
	});
	const fbIsbns = [...new Set(fallbackRows.flatMap(coverIsbns))];
	await Promise.all(
		fbIsbns.map((i) =>
			limit(async () => {
				if (!(i in cache.ol)) cache.ol[i] = await olFacts(i);
			}),
		),
	);
	const workKeys = [
		...new Set(fbIsbns.map((i) => cache.ol[i]?.work).filter((k): k is string => !!k)),
	];
	await Promise.all(
		workKeys.map((k) =>
			limit(async () => {
				if (!(k in cache.olWorks)) cache.olWorks[k] = await olWork(k);
			}),
		),
	);
	const authorKeys = [...new Set(workKeys.flatMap((k) => cache.olWorks[k]?.author_keys ?? []))];
	await Promise.all(
		authorKeys.map((k) =>
			limit(async () => {
				if (!(k in cache.olAuthors)) {
					cache.olAuthors[k] = (await fetchAuthor<{ name?: string }>(k))?.name ?? null;
				}
			}),
		),
	);
	await Promise.all(
		fallbackRows
			.filter((r) => coverIsbns(r).every((i) => cache.ol[i] == null) && r.author?.length)
			.map((r) =>
				limit(async () => {
					if (!(r.slug in cache.olSearch)) {
						cache.olSearch[r.slug] = await olSearchWorks(r.title, r.author?.[0] ?? '');
					}
				}),
			),
	);
	const workFacts = (key: string): OlWorkFacts | null => {
		const w = cache.olWorks[key];
		if (!w) return null;
		return {
			key,
			title: w.title,
			subtitle: w.subtitle,
			authors: w.author_keys.map((a) => cache.olAuthors[a]).filter((n): n is string => !!n),
			covers: w.covers,
			first_publish_year: w.first_publish_year,
			languages: [],
		};
	};
	const workCovers = new Map<string, WorkCoverEvidence>();
	for (const r of fallbackRows) {
		const isbns = coverIsbns(r);
		const editions = Object.fromEntries(isbns.map((i) => [i, cache.ol[i] ?? null] as const));
		const works = Object.fromEntries(
			isbns
				.map((i) => cache.ol[i]?.work)
				.filter((k): k is string => !!k)
				.map((k) => [k, workFacts(k)] as const),
		);
		const anyOnOl = isbns.some((i) => cache.ol[i] != null);
		workCovers.set(r.slug, {
			editions,
			works,
			search: anyOnOl ? null : (cache.olSearch[r.slug] ?? null),
		});
	}
	const fallbackUrls = [...workCovers]
		.map(([slug, ev]) => {
			const row = coverRows.find((r) => r.slug === slug);
			const d = row ? findWorkCover(row, ev) : null;
			return d?.kind === 'candidate' ? d.candidate.url : null;
		})
		.filter((u): u is string => !!u);
	await Promise.all(fallbackUrls.map(headCheck));
	saveCache(cache);

	// Assemble the pure inputs.
	const holders = new Map<string, string[]>();
	for (const r of catalog) {
		for (const i of new Set([...(r.isbn ?? []), ...(r.primary_isbn ? [r.primary_isbn] : [])])) {
			holders.set(i, [...(holders.get(i) ?? []), r.slug]);
		}
	}
	const isbnEvidence = new Map<string, IsbnEvidence>();
	for (const r of evidenceRows) {
		const p = r.primary_isbn;
		const wiki = cache.wiki[r.slug] ?? null;
		isbnEvidence.set(r.slug, {
			wiki_title: wiki?.title ?? null,
			wiki_infobox_isbns: wiki?.infobox_isbns ?? [],
			wiki_page_isbns: wiki?.page_isbns ?? [],
			openlibrary: Object.fromEntries(olIsbnsOf(r).map((i) => [i, cache.ol[i] ?? null] as const)),
			other_rows_with_primary: p ? (holders.get(p) ?? []).filter((s) => s !== r.slug) : [],
		});
	}
	const coverCandidates = new Map<string, CoverCandidate[]>();
	for (const r of coverRows) {
		const list: CoverCandidate[] = [];
		for (const isbn of coverIsbns(r)) {
			const c = cache.covers[isbn];
			for (const [source, url] of [
				['openlibrary', c?.ol ?? null],
				['google-books', c?.gb ?? null],
			] as const) {
				list.push({ isbn, source, url, head_ok: url ? cache.head[url] === true : false });
			}
		}
		const hit = cache.gbSearch[r.slug];
		if (hit?.cover_image) {
			list.push({
				isbn: hit.isbn,
				source: 'google-books-search',
				url: hit.cover_image,
				head_ok: cache.head[hit.cover_image] === true,
			});
		}
		coverCandidates.set(r.slug, list);
	}
	const wikiText = new Map<string, string>();
	for (const r of synopsisRows) {
		const w = cache.wiki[r.slug];
		if (w) wikiText.set(r.slug, w.text);
	}

	const cs = buildCleanupChangeset({
		rows: catalog,
		asOf,
		isbnEvidence,
		coverCandidates,
		drafts,
		wikiText,
		approvedIsbnAdditions: APPROVED_ISBN_ADDITIONS,
		approvedIsbnRemovals: APPROVED_ISBN_REMOVALS,
		invalidIsbnRemovals: INVALID_ISBN_REMOVALS,
		isbnHolders: holders,
		workCovers,
		fallbackHead: new Map(fallbackUrls.map((u) => [u, cache.head[u] === true] as const)),
		coverReviews: COVER_FALLBACK_REVIEWS,
	});
	writeFileSync(OUT_JSON, `${JSON.stringify(cs, null, 2)}\n`);
	writeFileSync(OUT_MD, summaryMarkdown(cs, catalog.length, label));

	const s = cs.summary;
	console.log(
		`\nCleanup → ${OUT_JSON.replace(`${ROOT}/`, '')}\n` +
			`  isbn_fixes ${s.isbn_fixes} (flagged ${s.isbn_flagged}) · cover_fills ${s.cover_fills} ` +
			`(missing ${s.covers_missing}, not yet available ${s.covers_not_yet_available}) · ` +
			`synopsis_fills ${s.synopsis_fills} (skipped ${s.synopses_skipped})\n` +
			`Summary → ${OUT_MD.replace(`${ROOT}/`, '')}`,
	);
}

main().catch((err) => {
	console.error(`\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
	process.exit(1);
});
