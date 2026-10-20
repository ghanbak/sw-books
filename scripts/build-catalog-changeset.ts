/**
 * Build the reviewable catalog changeset from the Wookieepedia discovery CSV.
 * READ-ONLY against the database — it never writes to any DB.
 *
 *   npx tsx scripts/build-catalog-changeset.ts --production   # vs the PROD catalog (read-only)
 *   npx tsx scripts/build-catalog-changeset.ts                # vs the LOCAL catalog
 *   …  --refresh-lookups                                     # ignore the lookup cache
 *
 * Outputs (deterministic for the same inputs + lookup cache + day):
 *   data/discovery/catalog-changeset.json  — inserts / updates / isbn_fixes, sorted by slug
 *   data/discovery/catalog-changeset.md    — short human summary
 *
 * Network (read-only): Open Library + Google Books (covers, audience evidence
 * for Legends `type`, ISBN-conflict evidence) and Wookieepedia (raw release-date
 * precision). Responses are cached in the gitignored
 * data/discovery/lookup-cache.json so re-runs are stable and polite.
 *
 * Operator `type` overrides for `needs_type` inserts: data/discovery/type-overrides.json
 * ({ "<wiki title>": "Adult Novel" | "YA Novel" | "Middle Grade Novel" }), then re-run.
 *
 * Apply with scripts/apply-catalog-changeset.ts (dry-run by default).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pLimit from 'p-limit';
import { headCheckCover } from '../lib/sources/covers';
import {
	type AudienceSignal,
	buildOlCandidate,
	fetchAudienceSignals,
	lookupCandidatesFor,
} from '../lib/sources/lookup';
import { fetchByIsbn } from '../lib/sources/open-library';
import {
	type Changeset,
	type InsertLookup,
	type LiveBook,
	buildChangeset,
	coverFixCandidates,
	findIsbnConflicts,
	isBookType,
	normalizeIsbnList,
	prospectiveInserts,
} from '../lib/wookieepedia/changeset';
import { fetchPages } from '../lib/wookieepedia/client';
import { DATE_KEYS, type DiscoveredBook } from '../lib/wookieepedia/derive';
import {
	type DatePrecision,
	cleanTitle,
	isCanceledPage,
	parseBookInfobox,
	wikiDatePrecision,
} from '../lib/wookieepedia/parse';
import { makeClient, productionEnv } from './_supabase';
import { DISCOVERY_CSV, discoveryCsvSha256, loadDiscovered } from './lib/load-discovered';

const ROOT = resolve(__dirname, '..');
const DIR = resolve(ROOT, 'data', 'discovery');
const OUT_JSON = resolve(DIR, 'catalog-changeset.json');
const OUT_MD = resolve(DIR, 'catalog-changeset.md');
const CACHE = resolve(DIR, 'lookup-cache.json');
const TYPE_OVERRIDES = resolve(DIR, 'type-overrides.json');
const META = resolve(DIR, 'discovery-meta.json');

const PROD = process.argv.includes('--production');
const REFRESH = process.argv.includes('--refresh-lookups');

/**
 * Wiki titles never inserted (user decisions 2026-10-20), with the reason. Pages
 * tagged `{{Canceled}}` are ALSO auto-excluded at build time; the explicit list
 * stays so a wiki edit removing the tag can't silently re-admit them.
 */
const EXCLUDED_TITLES: ReadonlyMap<string, string> = new Map([
	['Untitled Boba Fett novel', 'unpublished placeholder'],
	['The Odyssey of Star Wars: An Epic Poem', 'poetry retelling, not a novel'],
	['Alien Exodus', 'canceled — never published (excerpts released as fan fiction)'],
	['Escape from Dagu', 'canceled Clone Wars novel — never published'],
	['Heart of the Jedi', 'canceled — never published'],
	['Mandorla', 'canceled — never published'],
	['Triple Threat', 'canceled — never published'],
	['The New Jedi Order: Knightfall I: Jedi Storm', 'canceled Knightfall trilogy — never published'],
	['Blood Oath', 'canceled — never published'],
	['The Mandalorian: An Original Novel', 'canceled — never published'],
	['Star Wars: Dark Empire', 'canceled novelization of the Dark Horse comic — never published'],
	[
		'Star Wars: Starfighter (junior novelization)',
		'incomplete data — no ISBN, no author, placeholder release date',
	],
	['The Vow of Silver Dawn', 'incomplete data — no ISBN or release date, pseudonymous author'],
]);

/**
 * Wiki publisher values that run several imprints together → the US/primary
 * imprint to keep (user decision 2026-10-20). Spelling is then folded to the
 * catalog's form by `normalizePublisher` (e.g. Disney–Lucasfilm Press).
 */
const PUBLISHER_SPLITS: ReadonlyMap<string, string> = new Map([
	['Del Rey (US) Arrow Books (UK)', 'Del Rey'],
	['Del Rey Random House Worlds', 'Del Rey'],
	['Disney–Lucasfilm Press Egmont UK Ltd', 'Disney–Lucasfilm Press'],
	// Listed UK-first on the wiki; Disney–Lucasfilm Press is the US publisher.
	['Egmont UK Ltd Disney–Lucasfilm Press', 'Disney–Lucasfilm Press'],
]);

/**
 * Flagged date updates the user reviewed and accepted on 2026-10-20 (month-only
 * wiki precision and/or a year change). Keyed by slug + the EXACT before>after,
 * so a rebuild that proposes a different date comes back as `pending`.
 */
const APPROVED_DATE_UPDATES: ReadonlySet<string> = new Set([
	'corellian-trilogy-showdown:1995-08-01>1995-09-01',
	'courtship-of-princess-leia:1994-08-01>1994-04-01',
	'dark-force-rising:1992-06-01>1992-05-01',
	'fotj-apocalypse:2011-06-21>2012-03-13',
	'jedi-academy-champions-of-the-force:1994-03-01>1994-10-01',
	'jedi-academy-dark-apprentice:1994-01-01>1994-07-01',
	'jedi-academy-jedi-search:1994-02-01>1994-03-01',
	'lotf-fury:2008-08-26>2007-11-27',
	'lotf-inferno:2008-05-27>2007-08-28',
	'lotf-invincible:2009-05-19>2008-05-13',
	'shadows-of-the-empire:1996-04-01>1996-05-01',
	'the-last-command:1993-05-01>1993-04-01',
	'the-truce-at-bakura:1994-01-01>1993-11-01',
	'x-wing-bacta-war:1997-01-01>1997-02-01',
	'x-wing-iron-fist:1998-06-01>1998-07-01',
	'x-wing-krytos-trap:1996-12-01>1996-10-01',
	'x-wing-rogue-squadron:1996-12-01>1996-01-01',
	'x-wing-wedges-gamble:1996-12-01>1996-05-01',
]);

const MIN_COVER_BYTES = 2048; // smaller is almost certainly a placeholder (refresh-covers.ts)

// --- Cache -----------------------------------------------------------------------

type Cache = {
	cover: Record<string, { url: string; source: string } | null>;
	audience: Record<string, AudienceSignal[]>;
	olTitle: Record<string, string | null>;
	datePrecision: Record<string, DatePrecision | null>;
	canceled: Record<string, boolean>;
	olCover: Record<string, { url: string; source: string } | null>;
};

function loadCache(): Cache {
	const empty: Cache = {
		cover: {},
		audience: {},
		olTitle: {},
		datePrecision: {},
		canceled: {},
		olCover: {},
	};
	if (REFRESH || !existsSync(CACHE)) return empty;
	try {
		return { ...empty, ...(JSON.parse(readFileSync(CACHE, 'utf-8')) as Partial<Cache>) };
	} catch {
		return empty;
	}
}

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
	return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function saveCache(c: Cache): void {
	const out = {
		cover: sortKeys(c.cover),
		audience: sortKeys(c.audience),
		olTitle: sortKeys(c.olTitle),
		datePrecision: sortKeys(c.datePrecision),
		canceled: sortKeys(c.canceled),
		olCover: sortKeys(c.olCover),
	};
	writeFileSync(CACHE, `${JSON.stringify(out, null, 2)}\n`);
}

// --- Lookups (network, read-only) --------------------------------------------------

/** Cover via the admin's OL/GB lookup, ISBN-anchored only (a title search can hit
 *  the wrong book). First candidate that passes the HEAD size check wins. */
async function findCover(d: DiscoveredBook): Promise<{ url: string; source: string } | null> {
	for (const isbn of normalizeIsbnList(d.isbn).slice(0, 3)) {
		const res = await lookupCandidatesFor({ isbn, title: d.title, author: d.author?.[0] ?? '' });
		const options: Array<[string | null | undefined, string]> = [
			[res.ol.cover_image, `openlibrary:isbn:${isbn}`],
			[res.gb.cover_image, `google-books:isbn:${isbn}`],
		];
		for (const [url, source] of options) {
			if (url && (await headCheckCover(url, { minBytes: MIN_COVER_BYTES }))) return { url, source };
		}
	}
	return null;
}

/** Open Library cover for one ISBN via the shared OL candidate builder (cover id,
 *  else the by-ISBN URL), kept only if it passes the same HEAD size check. */
async function olCover(isbn: string): Promise<{ url: string; source: string } | null> {
	const url = (await buildOlCandidate(isbn)).cover_image;
	if (url && (await headCheckCover(url, { minBytes: MIN_COVER_BYTES }))) {
		return { url, source: `openlibrary:isbn:${isbn}` };
	}
	return null;
}

type OlEditionTitle = { title?: string; subtitle?: string; full_title?: string };

async function olTitle(isbn: string): Promise<string | null> {
	const e = await fetchByIsbn<OlEditionTitle>(isbn);
	if (!e) return null;
	return e.full_title ?? ([e.title, e.subtitle].filter(Boolean).join(' ') || null);
}

type WikiFacts = { datePrecision: Map<string, DatePrecision>; canceled: Set<string> };

/** Per discovered title, from the live Wookieepedia page: the raw release-date
 *  precision and whether the page is tagged `{{Canceled}}`. */
async function fetchWikiFacts(titles: readonly string[], cache: Cache): Promise<WikiFacts> {
	const pageTitleOf = new Map<string, string>();
	try {
		const meta = JSON.parse(readFileSync(META, 'utf-8')) as { pages?: { title: string }[] };
		for (const p of meta.pages ?? []) {
			const k = cleanTitle(p.title);
			if (!pageTitleOf.has(k)) pageTitleOf.set(k, p.title);
		}
	} catch {
		// no sidecar — fall back to the discovered titles themselves
	}
	const missing = titles.filter((t) => !(t in cache.datePrecision) || !(t in cache.canceled));
	if (missing.length) {
		const wanted = new Map(missing.map((t) => [pageTitleOf.get(t) ?? t, t]));
		const pages = await fetchPages([...wanted.keys()]);
		for (const page of pages) {
			const t = wanted.get(page.title) ?? cleanTitle(page.title);
			const infobox = parseBookInfobox(page.wikitext) ?? {};
			const raw = DATE_KEYS.map((k) => infobox[k]).find((v) => v?.trim()) ?? '';
			cache.datePrecision[t] = wikiDatePrecision(raw);
			cache.canceled[t] = isCanceledPage(page.wikitext);
		}
		for (const t of missing) {
			if (!(t in cache.datePrecision)) cache.datePrecision[t] = null;
			if (!(t in cache.canceled)) cache.canceled[t] = false;
		}
	}
	const datePrecision = new Map<string, DatePrecision>();
	const canceled = new Set<string>();
	for (const t of titles) {
		const p = cache.datePrecision[t];
		if (p) datePrecision.set(t, p);
		if (cache.canceled[t]) canceled.add(t);
	}
	return { datePrecision, canceled };
}

// --- Summary ---------------------------------------------------------------------

function summaryMarkdown(cs: Changeset, sha: string, catalogRows: number, label: string): string {
	const L: string[] = [];
	L.push('# Catalog changeset summary', '');
	L.push(`Built ${cs.as_of} against the ${label} catalog (${catalogRows} rows).`);
	L.push(
		`Discovery CSV sha256 \`${sha.slice(0, 12)}\`. Apply: \`npx tsx scripts/apply-catalog-changeset.ts\`.`,
		'',
	);
	const s = cs.summary;
	L.push('| Section | Count |', '| --- | --- |');
	L.push(`| ISBN conflict fixes | ${s.isbn_fixes} |`);
	L.push(`| Cover fixes (cover_image only) | ${s.cover_fixes} |`);
	L.push(`| Flagged ISBN conflicts (not fixed) | ${s.flagged_isbn_conflicts} |`);
	L.push(
		`| Updates (date_published / format) | ${s.updates} (flagged & pending review: ${s.updates_flagged_pending}) |`,
	);
	L.push(`| Inserts | ${s.inserts} (needs_type: ${s.inserts_needs_type}) |`);
	L.push(`| Excluded | ${s.excluded} |`, `| Needs review (not applied) | ${s.review} |`, '');
	L.push('## ISBN conflict fixes', '');
	for (const f of cs.isbn_fixes) {
		for (const r of f.replacements) {
			L.push(
				`- \`${f.slug}\`: ${r.removed} → ${r.replacement}. The wiki assigns ${r.removed} to *${r.evidence.removed_isbn_wiki_title}* (\`${r.evidence.removed_isbn_owner}\`); OL: "${r.evidence.openlibrary_title ?? '—'}".`,
			);
		}
		if (f.before.primary_isbn !== f.after.primary_isbn) {
			L.push(`  - primary_isbn ${f.before.primary_isbn} → ${f.after.primary_isbn}`);
		}
		for (const fl of f.flags) L.push(`  - ⚠ ${fl}`);
	}
	if (cs.cover_fixes.length) {
		L.push('', '## Cover fixes (cover_image only, keyed by id)', '');
		for (const c of cs.cover_fixes) {
			L.push(
				`- \`${c.slug}\`: ${c.reason}`,
				`  - ${c.before ?? '∅'}`,
				`  - → ${c.after} (${c.source})`,
			);
		}
	}
	if (cs.flagged_isbn_conflicts.length) {
		L.push('', '## Flagged ISBN conflicts (operator decision)', '');
		for (const f of cs.flagged_isbn_conflicts) {
			L.push(`- \`${f.slug}\` ${f.isbn} (*${f.wiki_title}*): ${f.reason}`);
		}
	}
	const needs = cs.inserts.filter((i) => i.needs_type);
	if (needs.length) {
		L.push('', '## Inserts that need a `type` (apply is blocked until resolved)', '');
		for (const i of needs) L.push(`- *${i.wiki_title}* (\`${i.slug}\`): ${i.type_reason}`);
	}
	const flaggedInserts = cs.inserts.filter((i) => i.flags.some((f) => f !== 'no cover found'));
	if (flaggedInserts.length) {
		L.push('', '## Inserts with review flags', '');
		for (const i of flaggedInserts)
			L.push(`- *${i.wiki_title}* (\`${i.slug}\`): ${i.flags.join('; ')}`);
	}
	const flaggedUpdates = cs.updates.filter((u) => u.flags.length);
	if (flaggedUpdates.length) {
		L.push(
			'',
			'## Updates with review flags',
			'',
			'✓ = reviewed and accepted by the user (2026-10-20, `APPROVED_DATE_UPDATES`); ⚠ = pending review.',
			'',
		);
		for (const u of flaggedUpdates) {
			const d = u.changes.date_published;
			const mark = u.review_status === 'approved' ? '✓ approved' : '⚠ pending';
			L.push(
				`- ${mark} \`${u.slug}\`: ${u.flags.join('; ')}${d ? ` (${d.before} → ${d.after})` : ''}`,
			);
		}
	}
	if (cs.publisher_changes.length) {
		L.push('', '## Publisher normalization (inserts)', '');
		for (const c of cs.publisher_changes) {
			L.push(
				`- "${c.from}" → "${c.to}" (${c.rule}; ${c.slugs.length}): ${c.slugs.map((x) => `\`${x}\``).join(', ')}`,
			);
		}
	}
	if (cs.excluded.length) {
		L.push('', '## Excluded (never inserted)', '');
		for (const e of cs.excluded) L.push(`- *${e.wiki_title}*: ${e.reason}`);
	}
	if (cs.review.length) {
		L.push('', '## Needs review (not in the changeset)', '');
		for (const r of cs.review) L.push(`- *${r.wiki_title}* [${r.slugs.join(', ')}]: ${r.reason}`);
	}
	L.push('');
	return L.join('\n');
}

// --- Main ------------------------------------------------------------------------

async function main(): Promise<void> {
	// Google Books keyless quota is ~0/day; the key lives in .env.production.
	if (!process.env.GOOGLE_BOOKS_API_KEY) {
		const key = productionEnv().GOOGLE_BOOKS_API_KEY;
		if (key) process.env.GOOGLE_BOOKS_API_KEY = key;
	}
	const discovered = loadDiscovered();
	const sha = discoveryCsvSha256();
	const supabase = makeClient(PROD);
	const { data, error } = await supabase.from('books').select('*').order('slug');
	if (error) throw new Error(`catalog read failed: ${error.message}`);
	const catalog = (data ?? []) as unknown as LiveBook[];
	const label = PROD ? 'PRODUCTION' : 'LOCAL';
	console.log(
		`Catalog: ${label}, ${catalog.length} rows (read-only). Discovery: ${discovered.length} rows.`,
	);

	const cache = loadCache();
	const limit = pLimit(3);
	const typeOverrides: Record<string, string> = existsSync(TYPE_OVERRIDES)
		? (JSON.parse(readFileSync(TYPE_OVERRIDES, 'utf-8')) as Record<string, string>)
		: {};

	// 1. Wiki facts (release-date precision + {{Canceled}}) for every discovered row.
	const wiki = await fetchWikiFacts(
		discovered.map((d) => d.title),
		cache,
	);
	const allExcluded = new Set([...EXCLUDED_TITLES.keys(), ...wiki.canceled]);
	const kept = discovered.filter((d) => !allExcluded.has(d.title));

	// 2. Lookups for would-be inserts.
	const news = prospectiveInserts(discovered, catalog, allExcluded);
	console.log(`Looking up ${news.length} prospective inserts (cache: ${REFRESH ? 'off' : 'on'})…`);
	await Promise.all(
		news.map((d) =>
			limit(async () => {
				if (!(d.title in cache.cover)) cache.cover[d.title] = await findCover(d);
				const needsEvidence = !isBookType(d.type) && !isBookType(typeOverrides[d.title]);
				if (needsEvidence && !(d.title in cache.audience)) {
					cache.audience[d.title] = await fetchAudienceSignals({
						isbns: normalizeIsbnList(d.isbn).slice(0, 2),
						title: d.title,
						author: d.author?.[0] ?? '',
					});
				}
			}),
		),
	);
	const lookups = new Map<string, InsertLookup>(
		news.map((d) => [
			d.title,
			{ cover: cache.cover[d.title] ?? null, audience: cache.audience[d.title] ?? [] },
		]),
	);

	// 3. Open Library titles for every ISBN involved in a conflict (independent
	//    evidence), and OL covers for rows whose cover came from a misfiled ISBN.
	const probe = findIsbnConflicts(kept, catalog, new Map());
	const conflictIsbns = new Set([
		...probe.fixes.flatMap((f) => f.replacements.map((r) => r.removed)),
		...probe.flagged.map((f) => f.isbn),
	]);
	const coverIsbns = new Set(coverFixCandidates(probe.fixes, catalog).map((c) => c.isbn));
	await Promise.all([
		...[...conflictIsbns].map((i) =>
			limit(async () => {
				if (!(i in cache.olTitle)) cache.olTitle[i] = await olTitle(i);
			}),
		),
		...[...coverIsbns].map((i) =>
			limit(async () => {
				if (!(i in cache.olCover)) cache.olCover[i] = await olCover(i);
			}),
		),
	]);
	saveCache(cache);
	const olTitleByIsbn = new Map<string, string>();
	for (const i of conflictIsbns) {
		const t = cache.olTitle[i];
		if (t) olTitleByIsbn.set(i, t.replace(/\s+/g, ' ').trim());
	}
	const olCoverByIsbn = new Map([...coverIsbns].map((i) => [i, cache.olCover[i] ?? null]));

	const asOf = new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
	const cs = buildChangeset({
		discovered,
		catalog,
		excludedTitles: EXCLUDED_TITLES,
		canceledTitles: wiki.canceled,
		lookups,
		datePrecision: wiki.datePrecision,
		olTitleByIsbn,
		olCoverByIsbn,
		approvedDateUpdates: APPROVED_DATE_UPDATES,
		publisherSplits: PUBLISHER_SPLITS,
		typeOverrides,
		asOf,
	});
	writeFileSync(OUT_JSON, `${JSON.stringify(cs, null, 2)}\n`);
	writeFileSync(OUT_MD, summaryMarkdown(cs, sha, catalog.length, label));

	const s = cs.summary;
	console.log(
		`\nChangeset → ${OUT_JSON.replace(`${ROOT}/`, '')}\n` +
			`  isbn_fixes ${s.isbn_fixes} · cover_fixes ${s.cover_fixes} · flagged ISBN conflicts ${s.flagged_isbn_conflicts} · ` +
			`updates ${s.updates} (flagged pending ${s.updates_flagged_pending}) · inserts ${s.inserts} (needs_type ${s.inserts_needs_type}) · ` +
			`excluded ${s.excluded} · review ${s.review}\n` +
			`Summary → ${OUT_MD.replace(`${ROOT}/`, '')}  (source ${DISCOVERY_CSV.replace(`${ROOT}/`, '')})`,
	);
}

main().catch((err) => {
	console.error(`\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
	process.exit(1);
});
