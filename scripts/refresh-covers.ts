/**
 * Comprehensive cover refresh. For every book in data/books.csv:
 *   1. Download current cover and hash it.
 *   2. If the hash is on the placeholder blacklist, or the payload is tiny,
 *      or the fetch fails — re-source from OL → OL books API → OL search
 *      (ISBN-verified) → Google Books → PRH. Each candidate is downloaded,
 *      hashed, and rejected if its content is on the blacklist.
 *   3. Track hashes accepted during this run so we don't introduce new
 *      duplicates between books (e.g., OL search returning the same cover
 *      for two different High Republic Phase II titles).
 *
 * Blacklist is built from scripts/placeholder-report.json (all MD5s
 * appearing in duplicate clusters there are assumed bad).
 *
 * Output: scripts/cover-resource-map.json — a change-set of
 *   { slug: { oldUrl, newUrl, source, md5 } } — only for books whose cover
 * should change. No CSV writes happen here; review the map, then apply.
 *
 * Usage:
 *   npx tsx scripts/detect-placeholder-covers.ts   # produces placeholder-report.json
 *   npx tsx scripts/refresh-covers.ts
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv } from '../lib/csv/read';
import { fetchJson, fetchWithRetry } from '../lib/sources/fetch-retry';

const CSV_PATH = resolve(__dirname, '..', 'data', 'books.csv');
const REPORT_PATH = resolve(__dirname, 'placeholder-report.json');
const OUT_PATH = resolve(__dirname, 'cover-resource-map.json');
const POLITE_DELAY_MS = 120;
const MIN_BYTES = 2048; // anything smaller is almost certainly a placeholder

type Row = { title: string; slug: string; isbn: string; author: string; url: string };
type Fetched = { bytes: Buffer; contentType: string | null } | null;
type Candidate = { url: string; source: string; bytes: Buffer; md5: string } | null;

function loadRows(): Row[] {
	const records = parseCsv(readFileSync(CSV_PATH, 'utf-8'));
	const rows: Row[] = [];
	const seen = new Set<string>();
	for (const rec of records) {
		const url = (rec.cover_image ?? '').trim();
		if (!url) continue;
		const slug = (rec.slug ?? '').trim();
		if (seen.has(slug)) continue; // duplicate CSV rows — handled separately
		seen.add(slug);
		rows.push({
			title: (rec.title ?? '').trim(),
			slug,
			isbn: (rec.isbn ?? '').replace(/[-\s]/g, ''),
			author: (rec.author ?? '').trim(),
			url,
		});
	}
	return rows;
}

function loadBlacklist(): Set<string> {
	const rep = JSON.parse(readFileSync(REPORT_PATH, 'utf-8')) as {
		duplicate_clusters: Array<{ md5: string }>;
	};
	return new Set(rep.duplicate_clusters.map((c) => c.md5));
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

async function fetchBytes(url: string): Promise<Fetched> {
	try {
		const res = await fetchWithRetry(url, { redirect: 'follow' }, { retries: 2 });
		if (!res.ok) return null;
		const ct = res.headers.get('content-type');
		const ab = await res.arrayBuffer();
		return { bytes: Buffer.from(ab), contentType: ct };
	} catch {
		return null;
	}
}

function md5(b: Buffer): string {
	return createHash('md5').update(b).digest('hex');
}

function isGoodImage(
	bytes: Buffer,
	ct: string | null,
	blacklist: Set<string>,
	used: Set<string>,
): boolean {
	if (bytes.length < MIN_BYTES) return false;
	if (ct && !/^image\//i.test(ct)) return false;
	const hash = md5(bytes);
	if (blacklist.has(hash)) return false;
	if (used.has(hash)) return false;
	return true;
}

async function tryUrl(
	url: string,
	source: string,
	blacklist: Set<string>,
	used: Set<string>,
): Promise<Candidate> {
	const f = await fetchBytes(url);
	if (!f) return null;
	if (!isGoodImage(f.bytes, f.contentType, blacklist, used)) return null;
	return { url, source, bytes: f.bytes, md5: md5(f.bytes) };
}

function normalize(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

async function olSearchForCover(
	title: string,
	author: string,
	isbn: string,
	blacklist: Set<string>,
	used: Set<string>,
): Promise<Candidate> {
	const mainTitle = title.split(':')[0].trim();
	const primaryAuthor = author.split(';')[0].split(',')[0].trim();
	const q = new URLSearchParams({ title: mainTitle, author: primaryAuthor, limit: '10' });
	const j = await fetchJson<{
		docs?: Array<{ cover_i?: number; title?: string; isbn?: string[] }>;
	}>(`https://openlibrary.org/search.json?${q.toString()}`);
	const docs = j?.docs ?? [];
	const target = isbn.toUpperCase();
	const mainNorm = normalize(mainTitle);

	// Prefer docs whose ISBN list contains the target.
	for (const doc of docs) {
		if (!doc.cover_i) continue;
		const isbns = (doc.isbn ?? []).map((x) => x.replace(/[-\s]/g, '').toUpperCase());
		if (target && isbns.includes(target)) {
			const c = await tryUrl(
				`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`,
				'ol-search-isbn',
				blacklist,
				used,
			);
			if (c) return c;
		}
	}
	// Fallback: title-start match.
	for (const doc of docs) {
		if (!doc.cover_i) continue;
		const dn = normalize(doc.title ?? '');
		if (dn === mainNorm || dn.startsWith(`${mainNorm} `)) {
			const c = await tryUrl(
				`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`,
				'ol-search-title',
				blacklist,
				used,
			);
			if (c) return c;
		}
	}
	return null;
}

async function googleBooksFor(
	isbn: string,
	blacklist: Set<string>,
	used: Set<string>,
): Promise<Candidate> {
	if (!isbn || isbn.length < 10) return null;
	const j = await fetchJson<{
		items?: Array<{
			volumeInfo?: { imageLinks?: { thumbnail?: string; smallThumbnail?: string } };
		}>;
	}>(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`);
	const raw =
		j?.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ??
		j?.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
	if (!raw) return null;
	const url = raw
		.replace(/^http:\/\//, 'https://')
		.replace(/&edge=curl/g, '')
		.replace(/zoom=\d+/, 'zoom=1');
	return await tryUrl(url, 'google-books', blacklist, used);
}

async function olBooksApiFor(
	isbn: string,
	blacklist: Set<string>,
	used: Set<string>,
): Promise<Candidate> {
	if (!isbn || isbn.length < 10) return null;
	const j = await fetchJson<Record<string, { cover?: { large?: string; medium?: string } }>>(
		`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
	);
	const entry = j?.[`ISBN:${isbn}`];
	const u = entry?.cover?.large ?? entry?.cover?.medium;
	if (!u) return null;
	return await tryUrl(u, 'ol-books-api', blacklist, used);
}

async function sourceCover(
	row: Row,
	blacklist: Set<string>,
	used: Set<string>,
): Promise<Candidate> {
	// 1. OL cover by ISBN
	if (row.isbn.length >= 10) {
		const c = await tryUrl(
			`https://covers.openlibrary.org/b/isbn/${row.isbn}-L.jpg?default=false`,
			'ol-isbn',
			blacklist,
			used,
		);
		if (c) return c;
		await sleep(POLITE_DELAY_MS);
	}
	// 2. OL books API
	const c2 = await olBooksApiFor(row.isbn, blacklist, used);
	if (c2) return c2;
	await sleep(POLITE_DELAY_MS);
	// 3. OL search
	const c3 = await olSearchForCover(row.title, row.author, row.isbn, blacklist, used);
	if (c3) return c3;
	await sleep(POLITE_DELAY_MS);
	// 4. Google Books
	const c4 = await googleBooksFor(row.isbn, blacklist, used);
	if (c4) return c4;
	await sleep(POLITE_DELAY_MS);
	// 5. PRH
	if (row.isbn.length >= 13) {
		const c5 = await tryUrl(
			`https://images2.penguinrandomhouse.com/cover/${row.isbn}`,
			'prh',
			blacklist,
			used,
		);
		if (c5) return c5;
	}
	return null;
}

async function main() {
	const rows = loadRows();
	const blacklist = loadBlacklist();
	const used = new Set<string>();

	process.stdout.write(
		`Refreshing ${rows.length} covers (blacklist has ${blacklist.size} hashes)\n\n`,
	);

	type Change = { slug: string; oldUrl: string; newUrl: string; source: string; md5: string };
	const changes: Change[] = [];
	const kept: string[] = [];
	const missing: Array<{ slug: string; oldUrl: string }> = [];

	let i = 0;
	for (const row of rows) {
		i++;
		const prefix = `[${String(i).padStart(3)}/${rows.length}] ${row.slug}`;

		// Probe current cover first.
		const current = await fetchBytes(row.url);
		if (current) {
			const hash = md5(current.bytes);
			const ctGood = !current.contentType || /^image\//i.test(current.contentType);
			const bigEnough = current.bytes.length >= MIN_BYTES;
			const notBlacklisted = !blacklist.has(hash);
			const notAlreadyUsed = !used.has(hash);
			if (ctGood && bigEnough && notBlacklisted && notAlreadyUsed) {
				used.add(hash);
				kept.push(row.slug);
				process.stdout.write(`${prefix}  ok (${current.bytes.length}B)\n`);
				continue;
			}
			const reasons = [
				!ctGood && `ct=${current.contentType}`,
				!bigEnough && `bytes=${current.bytes.length}`,
				!notBlacklisted && 'hash-blacklisted',
				!notAlreadyUsed && 'hash-dup-in-run',
			]
				.filter(Boolean)
				.join(', ');
			process.stdout.write(`${prefix}  bad (${reasons}) → re-sourcing\n`);
		} else {
			process.stdout.write(`${prefix}  unreachable → re-sourcing\n`);
		}

		const sourced = await sourceCover(row, blacklist, used);
		if (sourced) {
			used.add(sourced.md5);
			changes.push({
				slug: row.slug,
				oldUrl: row.url,
				newUrl: sourced.url,
				source: sourced.source,
				md5: sourced.md5,
			});
			process.stdout.write(`  ✓ ${sourced.source}: ${sourced.url} (${sourced.bytes.length}B)\n`);
		} else {
			missing.push({ slug: row.slug, oldUrl: row.url });
			process.stdout.write('  ✗ no valid cover found\n');
		}
		await sleep(POLITE_DELAY_MS);
	}

	writeFileSync(
		OUT_PATH,
		JSON.stringify(
			{
				ran_at: new Date().toISOString(),
				total: rows.length,
				kept: kept.length,
				changed: changes.length,
				missing: missing.length,
				changes,
				missing_list: missing,
			},
			null,
			2,
		),
	);

	process.stdout.write('\n=== Summary ===\n');
	process.stdout.write(`  kept     : ${kept.length}\n`);
	process.stdout.write(`  changed  : ${changes.length}\n`);
	process.stdout.write(`  missing  : ${missing.length}\n`);
	process.stdout.write(`  written  : ${OUT_PATH}\n`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
