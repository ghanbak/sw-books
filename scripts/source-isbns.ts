/**
 * Source per-edition ISBNs, formats, and covers for every book and produce
 * additive + corrective change-sets for the seed pipeline:
 *
 *   data/isbn-overrides.json      slug -> string[]      (final isbn[] when changed)
 *   data/primary-isbn.json        slug -> string         (preferred ISBN per book)
 *   data/cover-overrides.json     slug -> string         (cover URL anchored to primary_isbn)
 *   data/format-overrides.json    slug -> BookFormat[]  (distinct formats from editions)
 *
 * Per-user spec for the isbn[] change-set:
 *   - API-returned ISBN not in book.isbn → ADD
 *   - Existing ISBN flagged Tier-1 wrong → REMOVE/REPLACE
 *   - Everything else → LEAVE ALONE (do not blind-fill; APIs silent means skip)
 *
 * Tier-1 wrong (auto-remove):
 *   - ISBN is in scripts/isbn-collisions.json (committed list)
 *   - ISBN returns 404 on both Open Library /isbn and Google Books (3 retries)
 *
 * Tier-2 suspect (log, do NOT auto-remove):
 *   - ISBN resolves somewhere with title fuzzy-similarity < 0.5 and author
 *     mismatch → written to scripts/isbn-report.txt under REVIEW
 *
 * Post-merge collision scan:
 *   - After computing all overrides, scan final per-slug sets for any ISBN
 *     appearing in 2+ slugs. Log and auto-grow scripts/isbn-collisions.json
 *     so future runs auto-remove.
 *
 * Cover refresh (folded in this run):
 *   - For each book, after pickPrimaryIsbn picks the canonical edition, take its
 *     cover URL, HEAD-check (200 + content-length > 1024), write to
 *     data/cover-overrides.json. Manual overrides in data/cover-manual-overrides.json
 *     win at seed time.
 *
 * Cache:
 *   - schema_version 2 (rich EditionRecord per ISBN). Older cache entries are
 *     discarded on read; first run after refactor is cold (~10–15 min wall time).
 *
 * Concurrency:
 *   - p-limit(3) over rows. Sequential fetches inside a row stay in order.
 *
 * End-of-run ergonomics:
 *   - If REVIEW or COLLISIONS sections have entries, open the report in Cursor.
 *
 * Usage:
 *   npx tsx scripts/source-isbns.ts
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pLimit from 'p-limit';
import {
	type BookFormat,
	type EditionRecord,
	distinctFormats,
	normalizeFormat,
	pickPrimaryEdition,
	pickPrimaryIsbn,
} from './lib/pick-primary-isbn';

const CSV_PATH = resolve(__dirname, '..', 'data', 'books.csv');
const CACHE_PATH = resolve(__dirname, 'isbn-cache.json');
const COLLISIONS_PATH = resolve(__dirname, 'isbn-collisions.json');
const OVERRIDES_PATH = resolve(__dirname, '..', 'data', 'isbn-overrides.json');
const PRIMARY_ISBN_PATH = resolve(__dirname, '..', 'data', 'primary-isbn.json');
const COVER_OVERRIDES_PATH = resolve(__dirname, '..', 'data', 'cover-overrides.json');
const FORMAT_OVERRIDES_PATH = resolve(__dirname, '..', 'data', 'format-overrides.json');
const CSV_ISBN_REJECTED_PATH = resolve(__dirname, '..', 'data', 'csv-isbn-rejected.json');
const REPORT_PATH = resolve(__dirname, 'isbn-report.txt');

const CACHE_SCHEMA_VERSION = 9;
const CONCURRENCY = 3;
const POLITE_DELAY_MS = 150;
const TIMEOUT_MS = 12000;
const TIER2_SIMILARITY_THRESHOLD = 0.5;
const SOURCE_TRUST_THRESHOLD = 0.5;
const COVER_HEAD_MIN_BYTES = 1024;

type Row = { title: string; slug: string; authors: string[]; isbn: string };

// --- CSV ---
function parseCSVLine(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let q = false;
	for (const c of line) {
		if (c === '"') q = !q;
		else if (c === ',' && !q) {
			out.push(cur);
			cur = '';
		} else cur += c;
	}
	out.push(cur);
	return out;
}

function loadRows(): Row[] {
	const raw = readFileSync(CSV_PATH, 'utf-8').replace(/^﻿/, '');
	const lines = raw.split('\n').filter((l) => l.trim());
	const h = parseCSVLine(lines[0]).map((x) => x.replace(/^﻿/, ''));
	const iTitle = h.indexOf('title');
	const iSlug = h.indexOf('slug');
	const iAuthor = h.indexOf('author');
	const iIsbn = h.indexOf('isbn');
	const rows: Row[] = [];
	for (let i = 1; i < lines.length; i++) {
		const f = parseCSVLine(lines[i]);
		const isbn = (f[iIsbn] ?? '').replace(/[-\s]/g, '').trim();
		if (!isbn) continue;
		rows.push({
			title: f[iTitle].trim(),
			slug: f[iSlug].trim(),
			authors: (f[iAuthor] ?? '')
				.split(/[;,]/)
				.map((s) => s.trim())
				.filter(Boolean),
			isbn,
		});
	}
	return rows;
}

// --- ISBN utilities ---
function isIsbn13(s: string): boolean {
	return /^\d{13}$/.test(s);
}

function isIsbn10(s: string): boolean {
	return /^\d{9}[\dX]$/.test(s);
}

function isbn10to13(isbn10: string): string {
	const base = `978${isbn10.slice(0, 9)}`;
	let sum = 0;
	for (let i = 0; i < 12; i++) sum += Number.parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
	return `${base}${(10 - (sum % 10)) % 10}`;
}

function normalizeIsbn13(raw: string): string | null {
	const s = raw.replace(/[-\s]/g, '').toUpperCase();
	if (isIsbn13(s)) return s;
	if (isIsbn10(s)) return isbn10to13(s);
	return null;
}

function dedupe<T>(arr: T[]): T[] {
	return [...new Set(arr)];
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

// --- Fetch with timeout ---
async function fetchJson(url: string): Promise<unknown | null> {
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
		try {
			const res = await fetch(url, { signal: ctrl.signal });
			if (!res.ok) return null;
			return await res.json();
		} finally {
			clearTimeout(t);
		}
	} catch {
		return null;
	}
}

async function fetchJsonRetry(url: string, attempts = 3): Promise<unknown | null> {
	for (let i = 0; i < attempts; i++) {
		const r = await fetchJson(url);
		if (r !== null) return r;
		if (i < attempts - 1) await sleep(400 + i * 600);
	}
	return null;
}

async function headCheckCover(url: string): Promise<boolean> {
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
		try {
			const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
			if (!res.ok) return false;
			const len = Number(res.headers.get('content-length') ?? '0');
			if (len > 0 && len < COVER_HEAD_MIN_BYTES) return false;
			return true;
		} finally {
			clearTimeout(t);
		}
	} catch {
		return false;
	}
}

// --- Similarity (Jaro-ish short variant good enough for our needs) ---
function tokenize(s: string): string[] {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9\s]+/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

function tokenSimilarity(a: string, b: string): number {
	const at = new Set(tokenize(a));
	const bt = new Set(tokenize(b));
	if (at.size === 0 || bt.size === 0) return 0;
	let shared = 0;
	for (const t of at) if (bt.has(t)) shared++;
	return shared / Math.max(at.size, bt.size);
}

// --- OL + Google Books ---
type OLEdition = {
	isbn_13?: string[];
	isbn_10?: string[];
	physical_format?: string;
	publish_date?: string;
	covers?: number[];
	languages?: Array<{ key?: string }>;
};

// ISBN prefixes registered for English-language publishers worldwide. The first
// digit after the 978/979 EAN tells you the language group: 0/1 = English, 2 =
// French, 3 = German, 84 = Spain, 605 = Turkey, 83 = Poland, etc. We use this as
// the primary English-language signal because OL's `languages` field is absent
// from a high fraction of records (especially older catalog entries) — the
// language-tag check alone lets too many translations through.
function isEnglishLanguageIsbn(isbn: string): boolean {
	if (!/^\d{13}$/.test(isbn)) return false;
	const eanPrefix = isbn.slice(0, 3);
	if (eanPrefix !== '978' && eanPrefix !== '979') return false;
	const languageGroup = isbn[3];
	return languageGroup === '0' || languageGroup === '1';
}

function olEditionMostLikelyEnglish(e: OLEdition): boolean {
	const langs = e.languages ?? [];
	if (langs.length > 0) return langs.some((l) => l.key === '/languages/eng');
	const isbns = [...(e.isbn_13 ?? []), ...(e.isbn_10 ?? [])];
	if (isbns.length === 0) return true; // record with no ISBNs at all — keep
	const normalized = isbns
		.map((s) => normalizeIsbn13(s))
		.filter((s): s is string => s != null);
	if (normalized.length === 0) return true;
	return normalized.some(isEnglishLanguageIsbn);
}

function olCoverUrl(coverId: number | undefined, isbn: string): string {
	if (coverId && coverId > 0) return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
	return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}

function parseOlEditionToRecords(e: OLEdition): EditionRecord[] {
	const fmt: BookFormat | null = normalizeFormat(e.physical_format);
	const publish_date = e.publish_date ?? null;
	const coverId = e.covers?.[0];
	const out: EditionRecord[] = [];
	const isbns = new Set<string>();
	for (const s of [...(e.isbn_13 ?? []), ...(e.isbn_10 ?? [])]) {
		const n = normalizeIsbn13(s);
		if (n && isEnglishLanguageIsbn(n)) isbns.add(n);
	}
	for (const isbn of isbns) {
		out.push({
			isbn,
			format: fmt,
			publish_date,
			cover_url: olCoverUrl(coverId, isbn),
			source: 'ol',
		});
	}
	return out;
}

type OLIsbnMeta = {
	workKey: string | null;
	title: string | null;
	authors: string[];
};

async function olMetaFromIsbn(isbn: string): Promise<OLIsbnMeta> {
	const j = (await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`)) as {
		works?: Array<{ key: string }>;
		title?: string;
		authors?: Array<{ key?: string; name?: string }>;
	} | null;
	return {
		workKey: j?.works?.[0]?.key ?? null,
		title: j?.title ?? null,
		authors: (j?.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
	};
}

// Cross-check an external API's metadata against the CSV row. OL and Google
// Books both occasionally serve the wrong title for a given ISBN — Disney
// Lucasfilm Press editions are especially prone to this (e.g. The Fallen Star's
// ISBN files under "Two Lives of Lydia Bird" on OL). Trusting the API in those
// cases pulls in completely unrelated "sibling" editions and trashes the
// cover/primary_isbn pick.
//
// Heuristics:
//  - Strip "star wars[:]" / "the high republic[:]" prefixes from both sides
//    before comparing — OL records often add them, CSV usually doesn't.
//  - Use token-containment (smaller set fully covered by larger) rather than
//    size-max-ratio: "Tarkin" vs "Star Wars: Tarkin" has 1/3 max-ratio but 1/1
//    containment, which better captures the "subset of" intent.
//  - Author surname overlap rescues true matches whose titles still diverge
//    (subtitles, omnibi).
function normalizeTitleForMatch(t: string): string {
	return t
		.toLowerCase()
		.replace(/^the\s+high\s+republic\s*[:\-]?\s*/i, '')
		.replace(/^star\s+wars\s*[:\-]?\s*/i, '')
		.replace(/[^a-z0-9\s]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function tokenContainment(a: string, b: string): number {
	const at = new Set(tokenize(normalizeTitleForMatch(a)));
	const bt = new Set(tokenize(normalizeTitleForMatch(b)));
	if (at.size === 0 || bt.size === 0) return 0;
	const small = at.size <= bt.size ? at : bt;
	const large = at.size <= bt.size ? bt : at;
	let covered = 0;
	for (const t of small) if (large.has(t)) covered++;
	return covered / small.size;
}

function authorOverlap(externalAuthors: string[], row: Row): boolean {
	const externalAuthorJoin = externalAuthors.join(' ').toLowerCase();
	return row.authors.some((a) => {
		const last = a.toLowerCase().split(' ').slice(-1)[0];
		return last.length > 2 && externalAuthorJoin.includes(last);
	});
}

function externalTitleMatchesRow(
	externalTitle: string | null | undefined,
	externalAuthors: string[],
	row: Row,
): boolean {
	if (!externalTitle) return false;
	const containment = tokenContainment(externalTitle, row.title);
	if (containment >= SOURCE_TRUST_THRESHOLD) return true;
	return authorOverlap(externalAuthors, row);
}

async function olEditionsForWork(workKey: string): Promise<OLEdition[]> {
	const j = (await fetchJson(`https://openlibrary.org${workKey}/editions.json?limit=100`)) as {
		entries?: OLEdition[];
	} | null;
	return j?.entries ?? [];
}

// When the CSV ISBN's metadata doesn't match the CSV row, the CSV ISBN itself
// is the bad data. Find the right work via OL search by title+author so we can
// pull editions for the actual book we want.
type OLSearchHit = { workKey: string; title: string; authors: string[] };

// Stricter matcher for the search step: when we're trying to LOCATE the exact
// right work for a row, OL's title must contain all of the row's distinctive
// tokens. The probe-side externalTitleMatchesRow is permissive (small set in
// large set) which is fine for "is this the same book?" but fails on subtitle
// disambiguation: searching for "Aftermath: Life Debt" can't accept a hit
// titled simply "Aftermath".
function strictSearchMatch(
	externalTitle: string | null | undefined,
	externalAuthors: string[],
	row: Row,
): boolean {
	if (!externalTitle) return false;
	const at = new Set(tokenize(normalizeTitleForMatch(externalTitle)));
	const bt = new Set(tokenize(normalizeTitleForMatch(row.title)));
	if (at.size === 0 || bt.size === 0) return false;
	let covered = 0;
	for (const t of bt) if (at.has(t)) covered++;
	const rowCoverage = covered / bt.size;
	if (rowCoverage < 0.8) return false;
	return authorOverlap(externalAuthors, row);
}

async function olSearchByTitle(row: Row): Promise<OLSearchHit | null> {
	const title = encodeURIComponent(row.title);
	const author = encodeURIComponent(row.authors[0] ?? '');
	const j = (await fetchJson(
		`https://openlibrary.org/search.json?title=${title}&author=${author}&limit=10`,
	)) as {
		docs?: Array<{ key?: string; title?: string; author_name?: string[] }>;
	} | null;
	for (const doc of j?.docs ?? []) {
		if (!doc.key || !doc.title) continue;
		if (strictSearchMatch(doc.title, doc.author_name ?? [], row)) {
			return { workKey: doc.key, title: doc.title, authors: doc.author_name ?? [] };
		}
	}
	return null;
}

// Google Books gives us ISBN siblings + a thumbnail; format info is unreliable
// so we leave format=null and let pickPrimaryIsbn fall back to first-ISBN.
// Each match is title-checked against the CSV row before its ISBNs are emitted.
async function googleBooksEditionsFor(row: Row): Promise<EditionRecord[]> {
	const title = row.title;
	const authors = row.authors;
	const primary = authors[0] ?? '';
	const q = `intitle:${encodeURIComponent(title.split(':')[0].trim())}+inauthor:${encodeURIComponent(primary)}`;
	const j = (await fetchJson(
		`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5`,
	)) as {
		items?: Array<{
			volumeInfo?: {
				title?: string;
				authors?: string[];
				publishedDate?: string;
				industryIdentifiers?: Array<{ type: string; identifier: string }>;
				imageLinks?: {
					thumbnail?: string;
					smallThumbnail?: string;
					small?: string;
					medium?: string;
					large?: string;
					extraLarge?: string;
				};
			};
		}>;
	} | null;
	const out: EditionRecord[] = [];
	const seen = new Set<string>();
	for (const item of j?.items ?? []) {
		const v = item.volumeInfo;
		if (!v) continue;
		// Reject items whose Google Books title doesn't match the CSV row — search
		// by intitle/inauthor occasionally surfaces unrelated books for the same
		// keywords (omnibi, compilations, distinct works with overlapping titles).
		if (!externalTitleMatchesRow(v.title, v.authors ?? [], row)) continue;
		const cover = pickGoogleCover(v.imageLinks);
		for (const id of v.industryIdentifiers ?? []) {
			const n = normalizeIsbn13(id.identifier);
			if (!n || seen.has(n) || !isEnglishLanguageIsbn(n)) continue;
			seen.add(n);
			out.push({
				isbn: n,
				format: null,
				publish_date: v.publishedDate ?? null,
				cover_url: cover,
				source: 'google-books',
			});
		}
	}
	return out;
}

function pickGoogleCover(
	links:
		| {
				thumbnail?: string;
				smallThumbnail?: string;
				small?: string;
				medium?: string;
				large?: string;
				extraLarge?: string;
		  }
		| undefined,
): string | null {
	const raw = links?.extraLarge ?? links?.large ?? links?.medium ?? links?.thumbnail ?? null;
	if (!raw) return null;
	// Force https + strip the cover-curl edge effect for cleaner display.
	return raw.replace(/^http:/, 'https:').replace(/&edge=curl/g, '');
}

async function probeIsbn(isbn: string): Promise<{ title: string; authors: string[] } | null> {
	const ol = (await fetchJsonRetry(`https://openlibrary.org/isbn/${isbn}.json`)) as {
		title?: string;
		authors?: Array<{ key?: string; name?: string }>;
	} | null;
	if (ol?.title) {
		return {
			title: ol.title,
			authors: (ol.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
		};
	}
	const gb = (await fetchJsonRetry(
		`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`,
	)) as { items?: Array<{ volumeInfo?: { title?: string; authors?: string[] } }> } | null;
	const v = gb?.items?.[0]?.volumeInfo;
	if (v?.title) return { title: v.title, authors: v.authors ?? [] };
	return null;
}

// --- Cache ---
type CacheEntry = {
	schema_version: typeof CACHE_SCHEMA_VERSION;
	fetched_at: string;
	current_isbn: string;
	ol_work_id: string | null;
	editions: EditionRecord[];
	source: 'ol' | 'google-books' | 'none';
	// True when the CSV ISBN's OL metadata named a different book — we
	// substituted via title-search and the CSV ISBN should be discarded.
	csv_isbn_rejected: boolean;
	// What OL said the CSV ISBN actually was, for the report.
	csv_isbn_ol_title: string | null;
};

type Cache = { entries: Record<string, CacheEntry> };
type Collisions = { collisions: string[] };

function loadCache(): Cache {
	if (!existsSync(CACHE_PATH)) return { entries: {} };
	try {
		const parsed = JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as {
			entries?: Record<string, Partial<CacheEntry>>;
		};
		const entries: Record<string, CacheEntry> = {};
		let dropped = 0;
		for (const [slug, entry] of Object.entries(parsed.entries ?? {})) {
			if (entry?.schema_version === CACHE_SCHEMA_VERSION && Array.isArray(entry.editions)) {
				entries[slug] = entry as CacheEntry;
			} else {
				dropped++;
			}
		}
		if (dropped > 0) {
			process.stdout.write(
				`Cache: dropped ${dropped} pre-v${CACHE_SCHEMA_VERSION} entries (will re-fetch)\n`,
			);
		}
		return { entries };
	} catch {
		return { entries: {} };
	}
}

// --- Reports ---
type Report = {
	added_to: Array<{ slug: string; added: string[] }>;
	removed_from: Array<{ slug: string; removed: string[]; reasons: Record<string, string> }>;
	review: Array<{ slug: string; isbn: string; reason: string }>;
	unchanged: string[];
	collisions: Array<{ isbn: string; slugs: string[] }>;
	skipped: Array<{ slug: string; reason: string }>;
	cover_misses: Array<{ slug: string; reason: string }>;
};

// --- Per-row work ---
type ResolveResult = {
	editions: EditionRecord[];
	ol_work_id: string | null;
	source: CacheEntry['source'];
	csv_isbn_rejected: boolean;
	csv_isbn_ol_title: string | null;
};

function dedupEditionsPreferringFormat(records: EditionRecord[]): EditionRecord[] {
	const seen = new Map<string, EditionRecord>();
	for (const r of records) {
		const existing = seen.get(r.isbn);
		if (!existing || (existing.format == null && r.format != null)) seen.set(r.isbn, r);
	}
	return [...seen.values()];
}

async function fetchEditionsForWork(workKey: string): Promise<EditionRecord[]> {
	const olEditions = await olEditionsForWork(workKey);
	await sleep(POLITE_DELAY_MS);
	const englishOnly = olEditions.filter(olEditionMostLikelyEnglish);
	const records = englishOnly.flatMap(parseOlEditionToRecords);
	return dedupEditionsPreferringFormat(records);
}

function isOlGenericMetadata(meta: OLIsbnMeta): boolean {
	// OL has the edition record but lacks usable specifics: empty title or just
	// "Star Wars" (no subtitle), and no authors. These records are often correct
	// — we just can't validate via title — so treat them as a weak signal that
	// trusts the CSV ISBN rather than triggering full substitution.
	if (meta.authors.length > 0) return false;
	const t = (meta.title ?? '').toLowerCase().trim().replace(/\.$/, '');
	if (t === '' || t === 'star wars' || t === 'star wars legends') return true;
	return false;
}

async function resolveEditions(row: Row): Promise<ResolveResult> {
	const olMeta = await olMetaFromIsbn(row.isbn);
	await sleep(POLITE_DELAY_MS);
	const csvIsbnTrusted = externalTitleMatchesRow(olMeta.title, olMeta.authors, row);

	// Happy path: CSV ISBN's OL record matches the row. Pull editions normally.
	if (olMeta.workKey && csvIsbnTrusted) {
		const editions = await fetchEditionsForWork(olMeta.workKey);
		if (editions.length > 0) {
			return {
				editions,
				ol_work_id: olMeta.workKey,
				source: 'ol',
				csv_isbn_rejected: false,
				csv_isbn_ol_title: olMeta.title,
			};
		}
	}

	// Weak-signal path: OL has the record but its metadata is too sparse to
	// either confirm or reject. Trust CSV ISBN; merge editions from CSV's work
	// AND a title-search work (if any) so the isbn[] list still benefits from
	// sibling enrichment.
	if (olMeta.workKey && !csvIsbnTrusted && isOlGenericMetadata(olMeta)) {
		const csvWorkEditions = await fetchEditionsForWork(olMeta.workKey);
		const hit = await olSearchByTitle(row);
		await sleep(POLITE_DELAY_MS);
		const searchEditions = hit ? await fetchEditionsForWork(hit.workKey) : [];
		const merged = dedupEditionsPreferringFormat([...csvWorkEditions, ...searchEditions]);
		if (merged.length > 0) {
			return {
				editions: merged,
				ol_work_id: olMeta.workKey,
				source: 'ol',
				csv_isbn_rejected: false,
				csv_isbn_ol_title: olMeta.title,
			};
		}
	}

	// CSV ISBN is wrong — OL says it's a different book. Search OL for the
	// correct work by title+author and use its editions instead. The wrong CSV
	// ISBN gets dropped downstream because csv_isbn_rejected is true.
	if (olMeta.title && !csvIsbnTrusted) {
		const hit = await olSearchByTitle(row);
		await sleep(POLITE_DELAY_MS);
		if (hit) {
			const editions = await fetchEditionsForWork(hit.workKey);
			if (editions.length > 0) {
				return {
					editions,
					ol_work_id: hit.workKey,
					source: 'ol',
					csv_isbn_rejected: true,
					csv_isbn_ol_title: olMeta.title,
				};
			}
		}
	}

	// OL had no record for the CSV ISBN at all (404/silent). Try Google Books
	// search; its results are still title-validated against the row.
	const gb = await googleBooksEditionsFor(row);
	await sleep(POLITE_DELAY_MS);
	if (gb.length > 0) {
		return {
			editions: gb,
			ol_work_id: olMeta.workKey,
			source: 'google-books',
			csv_isbn_rejected: false,
			csv_isbn_ol_title: olMeta.title,
		};
	}

	return {
		editions: [],
		ol_work_id: olMeta.workKey,
		source: 'none',
		csv_isbn_rejected: false,
		csv_isbn_ol_title: olMeta.title,
	};
}

async function isTier1Wrong(
	existing: string,
	known: Set<string>,
): Promise<{ wrong: boolean; reason: string }> {
	if (known.has(existing)) return { wrong: true, reason: 'known-collision' };
	const olHit = await fetchJsonRetry(`https://openlibrary.org/isbn/${existing}.json`);
	const gbHit = await fetchJsonRetry(
		`https://www.googleapis.com/books/v1/volumes?q=isbn:${existing}&maxResults=1`,
	);
	const olHas = olHit !== null;
	const gbHasItems = gbHit !== null && (gbHit as { items?: unknown[] }).items;
	if (!olHas && (!gbHasItems || (gbHit as { items?: unknown[] }).items?.length === 0)) {
		return { wrong: true, reason: 'bogus-isbn-both-apis-404' };
	}
	return { wrong: false, reason: '' };
}

async function tier2Suspect(
	existing: string,
	row: Row,
): Promise<{ suspect: boolean; reason: string }> {
	const probe = await probeIsbn(existing);
	if (!probe) return { suspect: false, reason: 'no-probe-data' };
	const titleSim = tokenSimilarity(probe.title, row.title);
	const probeAuthorJoin = probe.authors.join(' ').toLowerCase();
	const authorMatch = row.authors.some((a) =>
		probeAuthorJoin.includes(a.toLowerCase().split(' ').slice(-1)[0]),
	);
	if (titleSim < TIER2_SIMILARITY_THRESHOLD && !authorMatch) {
		return {
			suspect: true,
			reason: `resolves to "${probe.title}" by ${probe.authors.join(', ') || '?'} (sim=${titleSim.toFixed(2)})`,
		};
	}
	return { suspect: false, reason: '' };
}

type RowOutcome = {
	slug: string;
	final: string[];
	added: string[];
	removed: { isbns: string[]; reasons: Record<string, string> };
	review: Array<{ isbn: string; reason: string }>;
	unchanged: boolean;
	source: CacheEntry['source'];
	editions: EditionRecord[];
	csv_isbn_rejected: boolean;
	csv_isbn_ol_title: string | null;
};

async function processRow(
	row: Row,
	cache: Cache,
	knownCollisions: Set<string>,
): Promise<RowOutcome> {
	let entry = cache.entries[row.slug];
	if (!entry || entry.current_isbn !== row.isbn || entry.schema_version !== CACHE_SCHEMA_VERSION) {
		const resolved = await resolveEditions(row);
		entry = {
			schema_version: CACHE_SCHEMA_VERSION,
			fetched_at: new Date().toISOString(),
			current_isbn: row.isbn,
			ol_work_id: resolved.ol_work_id,
			editions: resolved.editions,
			source: resolved.source,
			csv_isbn_rejected: resolved.csv_isbn_rejected,
			csv_isbn_ol_title: resolved.csv_isbn_ol_title,
		};
		cache.entries[row.slug] = entry;
	}

	const apiIsbns = entry.editions.map((e) => e.isbn);
	const current = [row.isbn];

	const removed: string[] = [];
	const reasons: Record<string, string> = {};
	const review: Array<{ isbn: string; reason: string }> = [];

	// If OL told us the CSV ISBN names a different book, drop it without further
	// probing — the substitution from olSearchByTitle is the authoritative answer.
	if (entry.csv_isbn_rejected) {
		removed.push(row.isbn);
		reasons[row.isbn] = `csv-isbn-belongs-to-other-book: "${entry.csv_isbn_ol_title ?? '?'}"`;
	} else {
		for (const ex of current) {
			if (apiIsbns.includes(ex)) continue;
			const t1 = await isTier1Wrong(ex, knownCollisions);
			if (t1.wrong) {
				removed.push(ex);
				reasons[ex] = t1.reason;
				continue;
			}
			const t2 = await tier2Suspect(ex, row);
			if (t2.suspect) review.push({ isbn: ex, reason: t2.reason });
		}
	}

	const added = apiIsbns.filter((i2) => !current.includes(i2));
	const final = dedupe([...current.filter((i2) => !removed.includes(i2)), ...added]);
	const unchanged = removed.length === 0 && added.length === 0;

	return {
		slug: row.slug,
		final,
		added,
		removed: { isbns: removed, reasons },
		review,
		unchanged,
		source: entry.source,
		editions: entry.editions,
		csv_isbn_rejected: entry.csv_isbn_rejected,
		csv_isbn_ol_title: entry.csv_isbn_ol_title,
	};
}

// --- Main ---
async function main() {
	const rows = loadRows();
	const cache = loadCache();
	const collisionsFile: Collisions = existsSync(COLLISIONS_PATH)
		? (JSON.parse(readFileSync(COLLISIONS_PATH, 'utf-8')) as Collisions)
		: { collisions: [] };
	const knownCollisions = new Set(collisionsFile.collisions);

	process.stdout.write(
		`Sourcing ISBNs for ${rows.length} books (cache=${Object.keys(cache.entries).length}, known-collisions=${knownCollisions.size}, concurrency=${CONCURRENCY})\n\n`,
	);

	const limit = pLimit(CONCURRENCY);
	let completed = 0;
	const checkpointEvery = 20;

	const outcomes = await Promise.all(
		rows.map((row, i) =>
			limit(async () => {
				const result = await processRow(row, cache, knownCollisions);
				completed += 1;
				const prefix = `[${String(i + 1).padStart(3)}/${rows.length}] ${row.slug}`;
				if (result.unchanged) {
					process.stdout.write(`${prefix}  unchanged (${result.editions.length} editions)\n`);
				} else {
					process.stdout.write(
						`${prefix}  +${result.added.length} -${result.removed.isbns.length} (final=${result.final.length}, editions=${result.editions.length})\n`,
					);
				}
				if (completed % checkpointEvery === 0) {
					writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
				}
				return result;
			}),
		),
	);

	writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));

	// --- Aggregate report ---
	const report: Report = {
		added_to: [],
		removed_from: [],
		review: [],
		unchanged: [],
		collisions: [],
		skipped: [],
		cover_misses: [],
	};
	const overrides: Record<string, string[]> = {};
	const editionsBySlug: Record<string, EditionRecord[]> = {};
	const rejectedOlBooks: Array<{ slug: string; csv_isbn: string; ol_title: string }> = [];

	for (const o of outcomes) {
		editionsBySlug[o.slug] = o.editions;
		for (const r of o.review) report.review.push({ slug: o.slug, isbn: r.isbn, reason: r.reason });
		if (o.csv_isbn_rejected) {
			rejectedOlBooks.push({
				slug: o.slug,
				csv_isbn: rows.find((r) => r.slug === o.slug)?.isbn ?? '',
				ol_title: o.csv_isbn_ol_title ?? '',
			});
		}
		if (o.unchanged) {
			report.unchanged.push(o.slug);
			if (o.source === 'none')
				report.skipped.push({ slug: o.slug, reason: 'apis-returned-nothing' });
			continue;
		}
		overrides[o.slug] = o.final;
		if (o.added.length) report.added_to.push({ slug: o.slug, added: o.added });
		if (o.removed.isbns.length) {
			report.removed_from.push({
				slug: o.slug,
				removed: o.removed.isbns,
				reasons: o.removed.reasons,
			});
		}
	}

	// --- Post-merge collision scan ---
	const finalBySlug: Record<string, string[]> = {};
	for (const r of rows) finalBySlug[r.slug] = overrides[r.slug] ?? [r.isbn];
	const owners = new Map<string, string[]>();
	for (const [slug, isbns] of Object.entries(finalBySlug)) {
		for (const i2 of isbns) {
			if (!owners.has(i2)) owners.set(i2, []);
			owners.get(i2)!.push(slug);
		}
	}
	const collidingIsbns = new Set<string>();
	for (const [isbn, slugs] of owners) {
		if (slugs.length > 1) {
			report.collisions.push({ isbn, slugs });
			knownCollisions.add(isbn);
			collidingIsbns.add(isbn);
		}
	}

	const originalIsbn: Record<string, string> = {};
	for (const r of rows) originalIsbn[r.slug] = r.isbn;
	const slugsWhereOriginalIsBogus = new Set<string>(
		report.removed_from.filter((r) => r.removed.includes(originalIsbn[r.slug])).map((r) => r.slug),
	);
	for (const slug of Object.keys(overrides)) {
		const orig = originalIsbn[slug];
		let scrubbed = overrides[slug].filter((i2) => !collidingIsbns.has(i2));
		if (!scrubbed.includes(orig) && !slugsWhereOriginalIsBogus.has(slug)) {
			scrubbed = [orig, ...scrubbed];
		}
		if (
			scrubbed.length === 1 &&
			scrubbed[0] === orig &&
			!report.removed_from.some((r) => r.slug === slug)
		) {
			delete overrides[slug];
		} else {
			overrides[slug] = scrubbed;
		}
	}

	// --- Derive primary_isbn / cover / format[] per book ---
	const primaryByslug: Record<string, string> = {};
	const formatBySlug: Record<string, BookFormat[]> = {};
	const coverBySlug: Record<string, string> = {};

	const allIsbns = (slug: string) => finalBySlug[slug] ?? [originalIsbn[slug]];

	process.stdout.write('\nResolving primary_isbn + covers (HEAD-checked)…\n');
	const coverLimit = pLimit(CONCURRENCY);
	await Promise.all(
		rows.map((row) =>
			coverLimit(async () => {
				const editions = editionsBySlug[row.slug] ?? [];
				// Restrict to ISBNs that survived collision-scrub.
				const allowed = new Set(allIsbns(row.slug));
				const usable = editions.filter((e) => allowed.has(e.isbn));
				const fmts = distinctFormats(usable);
				if (fmts.length > 0) formatBySlug[row.slug] = fmts;

				const picked = pickPrimaryEdition(usable, row.isbn);
				if (picked) {
					primaryByslug[row.slug] = picked.isbn;
					if (picked.cover_url) {
						const ok = await headCheckCover(picked.cover_url);
						if (ok) coverBySlug[row.slug] = picked.cover_url;
						else report.cover_misses.push({ slug: row.slug, reason: 'head-check-failed' });
					} else {
						report.cover_misses.push({ slug: row.slug, reason: 'no-cover-url-on-edition' });
					}
				} else if (usable.length > 0) {
					primaryByslug[row.slug] = usable[0].isbn;
					report.cover_misses.push({ slug: row.slug, reason: 'no-format-tagged-edition' });
				} else {
					report.cover_misses.push({ slug: row.slug, reason: 'no-editions-for-book' });
				}
			}),
		),
	);

	// --- Primary ISBN dedup pass ---
	// When OL has merged multiple books into one work (Aftermath trilogy, Thrawn
	// Ascendancy trilogy), title-search returns the same work for each volume,
	// and pickPrimaryIsbn picks the same paperback ISBN for all of them. We
	// can't tell which ISBN is the "real" primary for which volume, so drop
	// all conflicting picks and let those books fall back to manual override.
	const primaryOwners = new Map<string, string[]>();
	for (const [slug, isbn] of Object.entries(primaryByslug)) {
		if (!primaryOwners.has(isbn)) primaryOwners.set(isbn, []);
		primaryOwners.get(isbn)!.push(slug);
	}
	for (const [isbn, slugs] of primaryOwners) {
		if (slugs.length > 1) {
			for (const slug of slugs) {
				delete primaryByslug[slug];
				delete coverBySlug[slug];
				delete formatBySlug[slug];
				// Also drop isbn-override so seed falls back to the CSV ISBN — at
				// least each slug gets a distinct primary_isbn even if it's the
				// (likely-wrong) original. Better than two slugs sharing one ISBN.
				delete overrides[slug];
			}
			process.stdout.write(
				`Primary dedup: dropping ${slugs.length} slugs sharing ${isbn}: ${slugs.join(', ')}\n`,
			);
		}
	}

	// --- Cover dedup pass ---
	// Pipeline covers can collide when OL serves the same cover-id for several
	// editions (e.g. LotF reprints) or when Google Books returns the same omnibus
	// thumbnail for every volume in a series (X-Wing). In those cases we can't
	// pick one slug as the "real" owner, so drop them all and let the seed fall
	// back to the CSV cover_image (often the better publisher-direct URL anyway).
	const coverOwners = new Map<string, string[]>();
	for (const [slug, url] of Object.entries(coverBySlug)) {
		if (!coverOwners.has(url)) coverOwners.set(url, []);
		coverOwners.get(url)!.push(slug);
	}
	let coverDupsDropped = 0;
	for (const [url, slugs] of coverOwners) {
		if (slugs.length > 1) {
			for (const slug of slugs) {
				delete coverBySlug[slug];
				report.cover_misses.push({ slug, reason: `dup-cover-shared-with-${slugs.length - 1}-others` });
			}
			coverDupsDropped += slugs.length;
			process.stdout.write(
				`Cover dedup: dropping ${slugs.length} slugs sharing ${url}: ${slugs.join(', ')}\n`,
			);
		}
	}
	if (coverDupsDropped > 0) {
		process.stdout.write(`Cover dedup: removed ${coverDupsDropped} ambiguous cover overrides\n`);
	}

	// --- Persist ---
	writeFileSync(
		COLLISIONS_PATH,
		JSON.stringify({ collisions: [...knownCollisions].sort() }, null, 2),
	);
	writeFileSync(OVERRIDES_PATH, JSON.stringify(sortKeys(overrides), null, 2));
	writeFileSync(PRIMARY_ISBN_PATH, JSON.stringify(sortKeys(primaryByslug), null, 2));
	writeFileSync(COVER_OVERRIDES_PATH, JSON.stringify(sortKeys(coverBySlug), null, 2));
	writeFileSync(FORMAT_OVERRIDES_PATH, JSON.stringify(sortKeys(formatBySlug), null, 2));
	writeFileSync(
		CSV_ISBN_REJECTED_PATH,
		JSON.stringify(rejectedOlBooks.map((r) => r.slug).sort(), null, 2),
	);

	// Report text
	const lines: string[] = [];
	lines.push(`ISBN sourcing report — ${new Date().toISOString()}`);
	lines.push(`  books processed : ${rows.length}`);
	lines.push(`  unchanged       : ${report.unchanged.length}`);
	lines.push(`  added-to        : ${report.added_to.length}`);
	lines.push(`  removed-from    : ${report.removed_from.length}`);
	lines.push(`  review (Tier-2) : ${report.review.length}`);
	lines.push(`  collisions      : ${report.collisions.length}`);
	lines.push(`  skipped (no API): ${report.skipped.length}`);
	lines.push(`  primary_isbn set: ${Object.keys(primaryByslug).length}`);
	lines.push(`  cover_overrides : ${Object.keys(coverBySlug).length}`);
	lines.push(`  cover_misses    : ${report.cover_misses.length}`);
	lines.push(`  ol_rejected     : ${rejectedOlBooks.length}`);
	if (report.added_to.length) {
		lines.push('', '=== ADDED ===');
		for (const a of report.added_to) lines.push(`  ${a.slug}  +${a.added.join(', +')}`);
	}
	if (report.removed_from.length) {
		lines.push('', '=== REMOVED ===');
		for (const r of report.removed_from) {
			for (const isbn of r.removed) lines.push(`  ${r.slug}  -${isbn}  [${r.reasons[isbn]}]`);
		}
	}
	if (report.review.length) {
		lines.push('', '=== REVIEW (Tier-2 suspects — not auto-removed) ===');
		for (const r of report.review) lines.push(`  ${r.slug}  ${r.isbn}  ${r.reason}`);
	}
	if (report.collisions.length) {
		lines.push('', '=== COLLISIONS (post-merge) ===');
		for (const c of report.collisions) lines.push(`  ${c.isbn}  shared by ${c.slugs.join(', ')}`);
	}
	if (report.skipped.length) {
		lines.push('', '=== SKIPPED (APIs returned nothing) ===');
		for (const s of report.skipped) lines.push(`  ${s.slug}`);
	}
	if (report.cover_misses.length) {
		lines.push('', '=== COVER MISSES (existing cover_image preserved) ===');
		for (const c of report.cover_misses) lines.push(`  ${c.slug}  [${c.reason}]`);
	}
	if (rejectedOlBooks.length) {
		lines.push('', '=== OL REJECTED (CSV ISBN files under wrong title in OL) ===');
		for (const r of rejectedOlBooks) {
			lines.push(`  ${r.slug}  ${r.csv_isbn}  -> OL says "${r.ol_title}"`);
		}
	}
	writeFileSync(REPORT_PATH, lines.join('\n'));

	process.stdout.write('\n=== Summary ===\n');
	process.stdout.write(`  unchanged       : ${report.unchanged.length}\n`);
	process.stdout.write(`  added-to        : ${report.added_to.length}\n`);
	process.stdout.write(`  removed-from    : ${report.removed_from.length}\n`);
	process.stdout.write(`  review (Tier-2) : ${report.review.length}\n`);
	process.stdout.write(`  collisions      : ${report.collisions.length}\n`);
	process.stdout.write(`  skipped (no API): ${report.skipped.length}\n`);
	process.stdout.write(`  primary_isbn set: ${Object.keys(primaryByslug).length}\n`);
	process.stdout.write(`  cover_overrides : ${Object.keys(coverBySlug).length}\n`);
	process.stdout.write(`  cover_misses    : ${report.cover_misses.length}\n`);
	process.stdout.write(`  ol_rejected     : ${rejectedOlBooks.length}\n`);
	process.stdout.write(`\n  isbn-overrides    : ${OVERRIDES_PATH}\n`);
	process.stdout.write(`  primary-isbn      : ${PRIMARY_ISBN_PATH}\n`);
	process.stdout.write(`  cover-overrides   : ${COVER_OVERRIDES_PATH}\n`);
	process.stdout.write(`  format-overrides  : ${FORMAT_OVERRIDES_PATH}\n`);
	process.stdout.write(`  report            : ${REPORT_PATH}\n`);
	process.stdout.write(`  collisions file   : ${COLLISIONS_PATH}\n`);

	if (report.review.length > 0 || report.collisions.length > 0) {
		process.stdout.write(
			`\n⚠  ${report.review.length} Tier-2 suspects, ${report.collisions.length} collisions — opening report in Cursor\n`,
		);
		try {
			execSync(`cursor "${REPORT_PATH}"`, { stdio: 'ignore' });
		} catch {
			process.stdout.write(`(cursor CLI not available; open ${REPORT_PATH} manually)\n`);
		}
	}
}

function sortKeys<V>(obj: Record<string, V>): Record<string, V> {
	const out: Record<string, V> = {};
	for (const k of Object.keys(obj).sort()) out[k] = obj[k];
	return out;
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

// Reused symbols for type checking elsewhere
export { pickPrimaryIsbn };
