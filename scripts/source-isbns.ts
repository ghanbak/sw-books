/**
 * Source per-edition ISBNs for every book and produce a conservative, additive
 * + corrective change-set (data/isbn-overrides.json). Per-user spec:
 *
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
 * End-of-run ergonomics:
 *   - If REVIEW or COLLISIONS sections have entries, open the report in Cursor.
 *
 * Outputs:
 *   scripts/isbn-cache.json    (gitignored) — API responses for re-run speed
 *   scripts/isbn-collisions.json (committed) — persistent known-bad list
 *   data/isbn-overrides.json   (committed) — change-set: only slugs that changed
 *   scripts/isbn-report.txt    (gitignored) — human-readable summary
 *
 * Usage:
 *   npx tsx scripts/source-isbns.ts
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const CSV_PATH = resolve(__dirname, '..', 'data', 'books.csv');
const CACHE_PATH = resolve(__dirname, 'isbn-cache.json');
const COLLISIONS_PATH = resolve(__dirname, 'isbn-collisions.json');
const OVERRIDES_PATH = resolve(__dirname, '..', 'data', 'isbn-overrides.json');
const REPORT_PATH = resolve(__dirname, 'isbn-report.txt');

const POLITE_DELAY_MS = 150;
const TIMEOUT_MS = 12000;
const TIER2_SIMILARITY_THRESHOLD = 0.5;
const PRINT_FORMATS = new Set([
	'hardcover',
	'paperback',
	'ebook',
	'mass market paperback',
	'trade paperback',
	'library binding',
]);

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
			authors: (f[iAuthor] ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean),
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
type OLEdition = { isbn_13?: string[]; isbn_10?: string[]; physical_format?: string };

async function olWorkFromIsbn(isbn: string): Promise<string | null> {
	const j = (await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`)) as
		| { works?: Array<{ key: string }> }
		| null;
	return j?.works?.[0]?.key ?? null;
}

async function olEditionsForWork(workKey: string): Promise<OLEdition[]> {
	const j = (await fetchJson(`https://openlibrary.org${workKey}/editions.json?limit=100`)) as
		| { entries?: OLEdition[] }
		| null;
	return j?.entries ?? [];
}

async function googleBooksIsbnsFor(title: string, authors: string[]): Promise<string[]> {
	const primary = authors[0] ?? '';
	const q = `intitle:${encodeURIComponent(title.split(':')[0].trim())}+inauthor:${encodeURIComponent(primary)}`;
	const j = (await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5`)) as
		| {
				items?: Array<{
					volumeInfo?: {
						industryIdentifiers?: Array<{ type: string; identifier: string }>;
					};
				}>;
		  }
		| null;
	const out: string[] = [];
	for (const item of j?.items ?? []) {
		for (const id of item.volumeInfo?.industryIdentifiers ?? []) {
			const n = normalizeIsbn13(id.identifier);
			if (n) out.push(n);
		}
	}
	return dedupe(out);
}

async function probeIsbn(isbn: string): Promise<{ title: string; authors: string[] } | null> {
	// Try Open Library /isbn endpoint first.
	const ol = (await fetchJsonRetry(`https://openlibrary.org/isbn/${isbn}.json`)) as
		| { title?: string; authors?: Array<{ key?: string; name?: string }> }
		| null;
	if (ol?.title) {
		return { title: ol.title, authors: (ol.authors ?? []).map((a) => a.name ?? '').filter(Boolean) };
	}
	// Fallback to Google Books.
	const gb = (await fetchJsonRetry(
		`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`,
	)) as { items?: Array<{ volumeInfo?: { title?: string; authors?: string[] } }> } | null;
	const v = gb?.items?.[0]?.volumeInfo;
	if (v?.title) return { title: v.title, authors: v.authors ?? [] };
	return null;
}

// --- Main ---
type CacheEntry = {
	fetched_at: string;
	current_isbn: string;
	ol_work_id: string | null;
	api_isbns: string[];
	source: 'ol' | 'google-books' | 'none';
};

type Cache = { entries: Record<string, CacheEntry> };
type Collisions = { collisions: string[] };

type Report = {
	added_to: Array<{ slug: string; added: string[] }>;
	removed_from: Array<{ slug: string; removed: string[]; reasons: Record<string, string> }>;
	review: Array<{ slug: string; isbn: string; reason: string }>;
	unchanged: string[];
	collisions: Array<{ isbn: string; slugs: string[] }>;
	skipped: Array<{ slug: string; reason: string }>;
};

async function resolveApiIsbns(row: Row): Promise<{
	api_isbns: string[];
	ol_work_id: string | null;
	source: CacheEntry['source'];
}> {
	// 1) Open Library by ISBN → work → editions
	const workKey = await olWorkFromIsbn(row.isbn);
	await sleep(POLITE_DELAY_MS);
	if (workKey) {
		const editions = await olEditionsForWork(workKey);
		await sleep(POLITE_DELAY_MS);
		const filtered = editions.filter((e) => {
			const f = (e.physical_format ?? '').toLowerCase().trim();
			return !f || PRINT_FORMATS.has(f);
		});
		const isbns: string[] = [];
		for (const e of filtered) {
			for (const s of e.isbn_13 ?? []) {
				const n = normalizeIsbn13(s);
				if (n) isbns.push(n);
			}
			for (const s of e.isbn_10 ?? []) {
				const n = normalizeIsbn13(s);
				if (n) isbns.push(n);
			}
		}
		const deduped = dedupe(isbns);
		if (deduped.length > 0) return { api_isbns: deduped, ol_work_id: workKey, source: 'ol' };
	}
	// 2) Google Books fallback
	const gb = await googleBooksIsbnsFor(row.title, row.authors);
	await sleep(POLITE_DELAY_MS);
	if (gb.length > 0) return { api_isbns: gb, ol_work_id: workKey, source: 'google-books' };
	return { api_isbns: [], ol_work_id: workKey, source: 'none' };
}

async function isTier1Wrong(
	existing: string,
	known: Set<string>,
): Promise<{ wrong: boolean; reason: string }> {
	if (known.has(existing)) return { wrong: true, reason: 'known-collision' };
	// Require 404 on BOTH APIs after retries to qualify as Tier 1.
	const olHit = await fetchJsonRetry(`https://openlibrary.org/isbn/${existing}.json`);
	const gbHit = await fetchJsonRetry(
		`https://www.googleapis.com/books/v1/volumes?q=isbn:${existing}&maxResults=1`,
	);
	const olHas = olHit !== null;
	const gbHasItems = gbHit !== null && (gbHit as { totalItems?: number; items?: unknown[] }).items;
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

async function main() {
	const rows = loadRows();
	const cache: Cache = existsSync(CACHE_PATH)
		? (JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as Cache)
		: { entries: {} };
	const collisionsFile: Collisions = existsSync(COLLISIONS_PATH)
		? (JSON.parse(readFileSync(COLLISIONS_PATH, 'utf-8')) as Collisions)
		: { collisions: [] };
	const knownCollisions = new Set(collisionsFile.collisions);

	const overrides: Record<string, string[]> = {};
	const report: Report = {
		added_to: [],
		removed_from: [],
		review: [],
		unchanged: [],
		collisions: [],
		skipped: [],
	};

	process.stdout.write(
		`Sourcing ISBNs for ${rows.length} books (cache=${Object.keys(cache.entries).length}, known-collisions=${knownCollisions.size})\n\n`,
	);

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const prefix = `[${String(i + 1).padStart(3)}/${rows.length}] ${row.slug}`;

		// 1. Resolve API ISBNs (with cache)
		let entry = cache.entries[row.slug];
		if (!entry || entry.current_isbn !== row.isbn) {
			const resolved = await resolveApiIsbns(row);
			entry = {
				fetched_at: new Date().toISOString(),
				current_isbn: row.isbn,
				ol_work_id: resolved.ol_work_id,
				api_isbns: resolved.api_isbns,
				source: resolved.source,
			};
			cache.entries[row.slug] = entry;
			// Checkpoint cache every 20 books to survive interruptions.
			if ((i + 1) % 20 === 0) writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
		}

		const apiIsbns = entry.api_isbns;
		const current = [row.isbn];

		// 2. Classify existing ISBNs
		const toRemove: string[] = [];
		const reasons: Record<string, string> = {};
		for (const ex of current) {
			if (apiIsbns.includes(ex)) continue; // clearly correct
			const t1 = await isTier1Wrong(ex, knownCollisions);
			if (t1.wrong) {
				toRemove.push(ex);
				reasons[ex] = t1.reason;
				continue;
			}
			const t2 = await tier2Suspect(ex, row);
			if (t2.suspect) {
				report.review.push({ slug: row.slug, isbn: ex, reason: t2.reason });
			}
		}

		// 3. Compute additions
		const toAdd = apiIsbns.filter((i2) => !current.includes(i2));

		// 4. Decide
		if (toRemove.length === 0 && toAdd.length === 0) {
			report.unchanged.push(row.slug);
			if (entry.source === 'none') {
				report.skipped.push({ slug: row.slug, reason: 'apis-returned-nothing' });
			}
			process.stdout.write(`${prefix}  unchanged (${apiIsbns.length} API isbns)\n`);
			continue;
		}
		const final = dedupe([...current.filter((i2) => !toRemove.includes(i2)), ...toAdd]);
		overrides[row.slug] = final;
		if (toAdd.length) report.added_to.push({ slug: row.slug, added: toAdd });
		if (toRemove.length) report.removed_from.push({ slug: row.slug, removed: toRemove, reasons });
		process.stdout.write(
			`${prefix}  +${toAdd.length} -${toRemove.length} (final=${final.length})\n`,
		);
	}

	// Final cache write
	writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));

	// 5. Post-merge collision scan — find + remove.
	//    Build the final per-slug set: overrides when present, else [current].
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

	// Scrub colliding ISBNs from every override — the scanner can't disambiguate
	// them, so no book should claim them. Preserve the book's original CSV ISBN
	// UNLESS Tier-1 flagged it as genuinely bogus (404s on both APIs) — in that
	// case dropping it is the whole point.
	const originalIsbn: Record<string, string> = {};
	for (const r of rows) originalIsbn[r.slug] = r.isbn;
	const slugsWhereOriginalIsBogus = new Set<string>(
		report.removed_from
			.filter((r) => r.removed.includes(originalIsbn[r.slug]))
			.map((r) => r.slug),
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
			// Override dissolves back to the original single ISBN; no-op relative to CSV.
			delete overrides[slug];
		} else {
			overrides[slug] = scrubbed;
		}
	}

	// 6. Persist collisions + overrides + report
	writeFileSync(
		COLLISIONS_PATH,
		JSON.stringify({ collisions: [...knownCollisions].sort() }, null, 2),
	);

	const sortedOverrides: Record<string, string[]> = {};
	for (const k of Object.keys(overrides).sort()) sortedOverrides[k] = overrides[k];
	writeFileSync(OVERRIDES_PATH, JSON.stringify(sortedOverrides, null, 2));

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
	writeFileSync(REPORT_PATH, lines.join('\n'));

	// Summary to stdout
	process.stdout.write('\n=== Summary ===\n');
	process.stdout.write(`  unchanged       : ${report.unchanged.length}\n`);
	process.stdout.write(`  added-to        : ${report.added_to.length}\n`);
	process.stdout.write(`  removed-from    : ${report.removed_from.length}\n`);
	process.stdout.write(`  review (Tier-2) : ${report.review.length}\n`);
	process.stdout.write(`  collisions      : ${report.collisions.length}\n`);
	process.stdout.write(`  skipped (no API): ${report.skipped.length}\n`);
	process.stdout.write(`\n  overrides       : ${OVERRIDES_PATH}\n`);
	process.stdout.write(`  report          : ${REPORT_PATH}\n`);
	process.stdout.write(`  collisions file : ${COLLISIONS_PATH}\n`);

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

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
