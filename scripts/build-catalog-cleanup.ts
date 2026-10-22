/**
 * Build the reviewable catalog CLEANUP changeset. READ-ONLY against the
 * database — it never writes to any DB.
 *
 *   npm run catalog:cleanup                                   # vs the PROD catalog (read-only)
 *   npx tsx scripts/build-catalog-cleanup.ts                  # vs the LOCAL catalog
 *   …  --refresh-lookups                                      # ignore the lookup cache
 *
 * Three repairs (policy: lib/wookieepedia/cleanup.ts):
 *   1. primary_isbn ∉ isbn[] — add it (evidence: wiki infobox/page + Open Library),
 *      or reset primary_isbn when it belongs to another book; else flag.
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
	type CleanupChangeset,
	type CleanupFlag,
	type CleanupRow,
	type CoverCandidate,
	type CoverReview,
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
	const supabase = makeClient(PROD);
	const { data, error } = await supabase.from('books').select('*').order('slug');
	if (error) throw new Error(`catalog read failed: ${error.message}`);
	const catalog = (data ?? []) as unknown as Array<CatalogBook & CleanupRow>;
	const label = PROD ? 'PRODUCTION' : 'LOCAL';
	console.log(`Catalog: ${label}, ${catalog.length} rows (read-only).`);

	const drafts = JSON.parse(readFileSync(DRAFTS, 'utf-8')) as SynopsisDraftFile;
	const cache = loadCache();
	const limit = pLimit(3);
	const blank = (v: string | null) => v == null || v.trim() === '';

	const isbnRows = catalog.filter(
		(r) => r.primary_isbn != null && !(r.isbn ?? []).includes(r.primary_isbn),
	);
	const approvedSlugs = new Set(APPROVED_ISBN_ADDITIONS.map((a) => a.slug));
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
