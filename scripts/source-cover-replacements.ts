/**
 * For every broken cover_image URL identified by audit-covers.ts, try to source
 * a replacement from Open Library. Three-stage fallback:
 *
 *   1. Open Library covers by ISBN  (https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false)
 *   2. Open Library books API by ISBN — inspects response for a covers entry
 *   3. Open Library search by title+author — finds any edition with a cover
 *
 * Writes `scripts/cover-replacements.json` with { slug: { newUrl, source, notes } | { newUrl: null } }.
 * Nothing else is mutated — no CSV edit, no DB write.
 *
 * Usage:
 *   npx tsx scripts/audit-covers.ts            # produces cover-audit-report.json (prereq)
 *   npx tsx scripts/source-cover-replacements.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const AUDIT_PATH = resolve(__dirname, 'cover-audit-report.json');
const CSV_PATH = resolve(__dirname, '..', 'data', 'books.csv');
const OUT_PATH = resolve(__dirname, 'cover-replacements.json');
const POLITE_DELAY_MS = 150;
const TIMEOUT_MS = 10000;

type Broken = { title: string; slug: string; isbn: string; url: string; status: number | string };
type Replacement =
	| {
			newUrl: string;
			source:
				| 'ol-isbn-cover'
				| 'ol-books-api'
				| 'ol-search-isbn'
				| 'ol-search-title'
				| 'google-books'
				| 'prh'
				| 'existing';
			note?: string;
	  }
	| { newUrl: null; source: 'none'; note: string };

function parseCSVLine(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let q = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') q = !q;
		else if (c === ',' && !q) {
			out.push(cur.trim());
			cur = '';
		} else cur += c;
	}
	out.push(cur.trim());
	return out;
}

function loadCsvRow(slug: string): { title: string; author: string; isbn: string } | null {
	const raw = readFileSync(CSV_PATH, 'utf-8').replace(/^﻿/, '');
	const lines = raw.split('\n').filter((l) => l.trim());
	const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^﻿/, ''));
	const iSlug = headers.indexOf('slug');
	const iTitle = headers.indexOf('title');
	const iAuthor = headers.indexOf('author');
	const iIsbn = headers.indexOf('isbn');
	for (let i = 1; i < lines.length; i++) {
		const f = parseCSVLine(lines[i]);
		if (f[iSlug] === slug) return { title: f[iTitle], author: f[iAuthor], isbn: f[iIsbn] ?? '' };
	}
	return null;
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout<T>(p: Promise<T>): Promise<T> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	try {
		return await p;
	} finally {
		clearTimeout(timer);
	}
}

async function headOkOnce(url: string): Promise<boolean> {
	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
		try {
			// default=false returns 404 when OL has no image (otherwise it returns a 1x1).
			const res = await fetch(url, { method: 'GET', signal: ctrl.signal, redirect: 'follow', headers: { Range: 'bytes=0-0' } });
			return res.status >= 200 && res.status < 300;
		} finally {
			clearTimeout(timer);
		}
	} catch {
		return false;
	}
}

async function headOk(url: string): Promise<boolean> {
	for (let attempt = 0; attempt < 3; attempt++) {
		if (await headOkOnce(url)) return true;
		if (attempt < 2) await sleep(300 + attempt * 500);
	}
	return false;
}

async function tryOpenLibraryByIsbn(isbn: string): Promise<string | null> {
	if (!isbn || isbn.length < 10) return null;
	const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
	return (await headOk(url)) ? url : null;
}

async function tryGoogleBooks(isbn: string): Promise<string | null> {
	if (!isbn || isbn.length < 10) return null;
	try {
		const res = await withTimeout(
			fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`),
		);
		const j = (await res.json()) as {
			items?: Array<{ volumeInfo?: { imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }>;
		};
		const raw = j.items?.[0]?.volumeInfo?.imageLinks?.thumbnail ?? j.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
		if (!raw) return null;
		// Force https, strip edge=curl which makes the image 'torn-page' looking, and drop zoom to get a larger img.
		const url = raw
			.replace(/^http:\/\//, 'https://')
			.replace(/&edge=curl/g, '')
			.replace(/zoom=\d+/, 'zoom=1');
		return (await headOk(url)) ? url : null;
	} catch {
		return null;
	}
}

async function tryPrhCover(isbn: string): Promise<string | null> {
	if (!isbn || isbn.length < 13) return null;
	const url = `https://images2.penguinrandomhouse.com/cover/${isbn}`;
	return (await headOk(url)) ? url : null;
}

async function tryOpenLibraryBooksApi(isbn: string): Promise<string | null> {
	if (!isbn || isbn.length < 10) return null;
	try {
		const res = await withTimeout(
			fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`),
		);
		const j = (await res.json()) as Record<string, { cover?: { large?: string; medium?: string } }>;
		const entry = j[`ISBN:${isbn}`];
		const u = entry?.cover?.large ?? entry?.cover?.medium ?? null;
		if (u && (await headOk(u))) return u;
	} catch {
		// fall through
	}
	return null;
}

function normIsbn(s: string): string {
	return s.replace(/[-\s]/g, '').toUpperCase();
}

function norm(s: string | undefined): string {
	return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function tryOpenLibrarySearch(
	title: string,
	author: string,
	isbn: string,
): Promise<{ url: string; match: 'isbn' | 'title' } | null> {
	// Strip subtitle after colon for better matching.
	const mainTitle = title.split(':')[0].trim();
	const primaryAuthor = author.split(';')[0].split(',')[0].trim();
	const mainNorm = norm(mainTitle);
	const targetIsbn = normIsbn(isbn);

	const q = new URLSearchParams({ title: mainTitle, author: primaryAuthor, limit: '10' });
	try {
		const res = await withTimeout(fetch(`https://openlibrary.org/search.json?${q.toString()}`));
		const j = (await res.json()) as {
			docs?: Array<{ cover_i?: number; title?: string; isbn?: string[] }>;
		};
		const docs = j.docs ?? [];

		// Strong match: doc's ISBN list contains our target ISBN.
		for (const doc of docs) {
			if (!doc.cover_i) continue;
			const isbns = (doc.isbn ?? []).map(normIsbn);
			if (targetIsbn && isbns.includes(targetIsbn)) {
				const url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`;
				if (await headOk(url)) return { url, match: 'isbn' };
			}
		}

		// Fallback: doc's title starts with our main title (case-insensitive, normalized).
		for (const doc of docs) {
			if (!doc.cover_i) continue;
			const dn = norm(doc.title);
			if (dn === mainNorm || dn.startsWith(`${mainNorm} `)) {
				const url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`;
				if (await headOk(url)) return { url, match: 'title' };
			}
		}
	} catch {
		// fall through
	}
	return null;
}

async function main() {
	const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8')) as { non_2xx: Broken[] };
	const broken = audit.non_2xx;
	process.stdout.write(`Sourcing replacements for ${broken.length} broken cover URLs…\n\n`);

	const out: Record<string, Replacement> = {};
	let ok = 0;
	let miss = 0;

	for (const b of broken) {
		const row = loadCsvRow(b.slug);
		const title = row?.title ?? b.title;
		const author = row?.author ?? '';
		const isbn = (row?.isbn ?? b.isbn).replace(/[-\s]/g, '');

		process.stdout.write(`${b.slug}\n  isbn=${isbn || '—'}\n`);

		// 1. Open Library covers by ISBN
		let url = await tryOpenLibraryByIsbn(isbn);
		let source: Replacement['source'] = url ? 'ol-isbn-cover' : 'none';
		await sleep(POLITE_DELAY_MS);

		// 2. Open Library Books API by ISBN
		if (!url) {
			url = await tryOpenLibraryBooksApi(isbn);
			if (url) source = 'ol-books-api';
			await sleep(POLITE_DELAY_MS);
		}

		// 3. Open Library search by title + author + ISBN verification
		if (!url) {
			const hit = await tryOpenLibrarySearch(title, author, isbn);
			if (hit) {
				url = hit.url;
				source = hit.match === 'isbn' ? 'ol-search-isbn' : 'ol-search-title';
			}
			await sleep(POLITE_DELAY_MS);
		}

		// 4. Google Books (keyless)
		if (!url) {
			url = await tryGoogleBooks(isbn);
			if (url) source = 'google-books';
			await sleep(POLITE_DELAY_MS);
		}

		// 5. Penguin Random House direct cover URL (works only for PRH imprints: Del Rey, Bantam, etc.)
		if (!url) {
			url = await tryPrhCover(isbn);
			if (url) source = 'prh';
			await sleep(POLITE_DELAY_MS);
		}

		if (url) {
			out[b.slug] = { newUrl: url, source };
			ok++;
			process.stdout.write(`  ✓ ${source}: ${url}\n\n`);
		} else {
			out[b.slug] = { newUrl: null, source: 'none', note: 'OL has no cover via ISBN or title+author search' };
			miss++;
			process.stdout.write(`  ✗ no OL cover found\n\n`);
		}
	}

	writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
	process.stdout.write(`\n=== Summary ===\n`);
	process.stdout.write(`  resolved : ${ok}\n`);
	process.stdout.write(`  missing  : ${miss}\n`);
	process.stdout.write(`  written  : ${OUT_PATH}\n`);

	if (miss > 0) {
		process.stdout.write(`\nMissing (manual upload or alternate source needed):\n`);
		for (const [slug, rep] of Object.entries(out)) {
			if (rep.newUrl === null) process.stdout.write(`  - ${slug}\n`);
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
