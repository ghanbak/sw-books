/**
 * Audit: read primary_isbn from local books table; probe each ISBN against
 * Open Library and Google Books; report any whose returned title doesn't match
 * the book row's title (using the same containment matcher the pipeline uses).
 *
 * Usage:
 *   npx tsx scripts/verify-primary-isbns.ts
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_KEY) {
	console.error('SUPABASE_SERVICE_ROLE_KEY not set');
	process.exit(1);
}

const TIMEOUT_MS = 12000;
const CONCURRENCY = 4;
const TITLE_THRESHOLD = 0.5;
const REPORT_PATH = resolve(__dirname, 'primary-isbn-verification.txt');

function tokenize(s: string): string[] {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9\s]+/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

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

function authorOverlap(externalAuthors: string[], rowAuthors: string[]): boolean {
	const externalAuthorJoin = externalAuthors.join(' ').toLowerCase();
	return rowAuthors.some((a) => {
		const last = a.toLowerCase().split(' ').slice(-1)[0];
		return last.length > 2 && externalAuthorJoin.includes(last);
	});
}

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

type Probe = { source: 'ol' | 'gb' | 'none'; title: string | null; authors: string[] };

async function probeOl(isbn: string): Promise<Probe> {
	const j = (await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`)) as
		| { title?: string; authors?: Array<{ key?: string; name?: string }> }
		| null;
	if (!j) return { source: 'none', title: null, authors: [] };
	return {
		source: 'ol',
		title: j.title ?? null,
		authors: (j.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
	};
}

async function probeGb(isbn: string): Promise<Probe> {
	const j = (await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)) as
		| { items?: Array<{ volumeInfo?: { title?: string; authors?: string[] } }> }
		| null;
	const v = j?.items?.[0]?.volumeInfo;
	if (!v) return { source: 'none', title: null, authors: [] };
	return { source: 'gb', title: v.title ?? null, authors: v.authors ?? [] };
}

type Verdict = 'match' | 'weak' | 'mismatch' | 'no-data';

function classify(probe: Probe, rowTitle: string, rowAuthors: string[]): Verdict {
	if (!probe.title) return 'no-data';
	const containment = tokenContainment(probe.title, rowTitle);
	if (containment >= TITLE_THRESHOLD) return 'match';
	if (authorOverlap(probe.authors, rowAuthors)) return 'match';
	// Generic OL records like "Star Wars" — can't validate either way
	const norm = normalizeTitleForMatch(probe.title);
	if (norm === '' || norm === 'star wars') return 'weak';
	return 'mismatch';
}

async function main() {
	const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
	const { data, error } = await supabase
		.from('books')
		.select('slug, title, author, primary_isbn')
		.not('primary_isbn', 'is', null);
	if (error || !data) {
		console.error('DB query failed:', error);
		process.exit(1);
	}

	process.stdout.write(`Verifying ${data.length} primary_isbns...\n\n`);

	const limit = pLimit(CONCURRENCY);
	type Result = {
		slug: string;
		title: string;
		primary_isbn: string;
		ol_verdict: Verdict;
		ol_title: string | null;
		gb_verdict: Verdict;
		gb_title: string | null;
		final: Verdict;
	};
	const results: Result[] = [];

	let i = 0;
	await Promise.all(
		data.map((book) =>
			limit(async () => {
				const isbn = book.primary_isbn as string;
				const ol = await probeOl(isbn);
				const gb = await probeGb(isbn);
				const olVerdict = classify(ol, book.title, book.author);
				const gbVerdict = classify(gb, book.title, book.author);
				let final: Verdict = 'no-data';
				if (olVerdict === 'match' || gbVerdict === 'match') final = 'match';
				else if (olVerdict === 'mismatch' && gbVerdict === 'mismatch') final = 'mismatch';
				else if (olVerdict === 'mismatch' || gbVerdict === 'mismatch') final = 'weak';
				else if (olVerdict === 'weak' || gbVerdict === 'weak') final = 'weak';
				results.push({
					slug: book.slug,
					title: book.title,
					primary_isbn: isbn,
					ol_verdict: olVerdict,
					ol_title: ol.title,
					gb_verdict: gbVerdict,
					gb_title: gb.title,
					final,
				});
				i++;
				process.stdout.write(`  [${i}/${data.length}] ${book.slug}: ${final}\n`);
			}),
		),
	);

	results.sort((a, b) => a.slug.localeCompare(b.slug));

	const counts: Record<Verdict, number> = {
		match: 0,
		weak: 0,
		mismatch: 0,
		'no-data': 0,
	};
	for (const r of results) counts[r.final]++;

	const lines: string[] = [
		`primary_isbn verification — ${new Date().toISOString()}`,
		`  total checked : ${results.length}`,
		`  match         : ${counts.match}`,
		`  weak          : ${counts.weak}    (one API confirms or both have generic data)`,
		`  mismatch      : ${counts.mismatch} (BOTH APIs say it's a different book)`,
		`  no-data       : ${counts['no-data']} (neither API has the ISBN)`,
		'',
		'=== MISMATCHES (high confidence wrong) ===',
	];
	for (const r of results.filter((x) => x.final === 'mismatch')) {
		lines.push(
			`  ${r.slug}\n    title: ${r.title}\n    primary: ${r.primary_isbn}\n    OL: ${r.ol_title}\n    GB: ${r.gb_title}\n`,
		);
	}
	lines.push('', '=== WEAK (one API disagrees) ===');
	for (const r of results.filter((x) => x.final === 'weak')) {
		lines.push(
			`  ${r.slug}\n    title: ${r.title}\n    primary: ${r.primary_isbn}\n    OL: ${r.ol_title}\n    GB: ${r.gb_title}\n`,
		);
	}
	lines.push('', '=== NO-DATA (neither API has the ISBN) ===');
	for (const r of results.filter((x) => x.final === 'no-data')) {
		lines.push(`  ${r.slug}  ${r.primary_isbn}  (${r.title})`);
	}

	writeFileSync(REPORT_PATH, lines.join('\n'));
	process.stdout.write(`\n=== Summary ===\n`);
	process.stdout.write(`  match     : ${counts.match}\n`);
	process.stdout.write(`  weak      : ${counts.weak}\n`);
	process.stdout.write(`  mismatch  : ${counts.mismatch}\n`);
	process.stdout.write(`  no-data   : ${counts['no-data']}\n`);
	process.stdout.write(`\n  report    : ${REPORT_PATH}\n`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
