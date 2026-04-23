/**
 * Audit every cover_image URL in data/books.csv with a HEAD request.
 * Bucket results by status; print non-200s for manual/scripted replacement.
 *
 * Usage:
 *   npx tsx scripts/audit-covers.ts
 *
 * No side effects — reads CSV, hits the network, writes a report to stdout
 * and `scripts/cover-audit-report.json` (gitignored).
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const CSV_PATH = resolve(__dirname, '..', 'data', 'books.csv');
const REPORT_PATH = resolve(__dirname, 'cover-audit-report.json');
const CONCURRENCY = 8;
const TIMEOUT_MS = 8000;

type Row = { title: string; slug: string; isbn: string; url: string };
type Result = Row & { status: number | 'timeout' | 'error'; statusText?: string };

function parseCSVLine(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') inQuotes = !inQuotes;
		else if (c === ',' && !inQuotes) {
			out.push(cur.trim());
			cur = '';
		} else cur += c;
	}
	out.push(cur.trim());
	return out;
}

function loadRows(): Row[] {
	const raw = readFileSync(CSV_PATH, 'utf-8').replace(/^﻿/, '');
	const lines = raw.split('\n').filter((l) => l.trim());
	const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^﻿/, ''));
	const col = (n: string) => headers.findIndex((h) => h === n);
	const iTitle = col('title');
	const iSlug = col('slug');
	const iIsbn = col('isbn');
	const iUrl = col('cover_image');
	if (iTitle < 0 || iSlug < 0 || iUrl < 0) throw new Error(`Missing columns in CSV`);

	const rows: Row[] = [];
	for (let i = 1; i < lines.length; i++) {
		const f = parseCSVLine(lines[i]);
		const url = f[iUrl];
		if (!url) continue;
		rows.push({ title: f[iTitle], slug: f[iSlug], isbn: f[iIsbn] ?? '', url });
	}
	return rows;
}

async function head(
	url: string,
): Promise<{ status: number | 'timeout' | 'error' | 'not-image'; statusText?: string; contentType?: string }> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	try {
		// Some CDNs (Disney/Lumiere, PRH) reject HEAD; fall back to GET with Range.
		let res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
		if (res.status === 405 || res.status === 403) {
			res = await fetch(url, {
				method: 'GET',
				signal: ctrl.signal,
				redirect: 'follow',
				headers: { Range: 'bytes=0-0' },
			});
		}
		const ct = res.headers.get('content-type') ?? '';
		// Amazon /dp/{asin} returns 200 text/html (product page). Flag as "not-image".
		if (res.status >= 200 && res.status < 300 && !/^image\//i.test(ct)) {
			return { status: 'not-image', contentType: ct, statusText: res.statusText };
		}
		return { status: res.status, statusText: res.statusText, contentType: ct };
	} catch (e) {
		const err = e as Error;
		if (err.name === 'AbortError') return { status: 'timeout' };
		return { status: 'error', statusText: err.message };
	} finally {
		clearTimeout(t);
	}
}

async function runPool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
		while (true) {
			const i = next++;
			if (i >= items.length) return;
			results[i] = await fn(items[i]);
		}
	});
	await Promise.all(workers);
	return results;
}

async function main() {
	const rows = loadRows();
	process.stdout.write(`Auditing ${rows.length} cover URLs (concurrency ${CONCURRENCY}, timeout ${TIMEOUT_MS}ms)\n\n`);

	let done = 0;
	const results = await runPool(rows, CONCURRENCY, async (r) => {
		const res = await head(r.url);
		done++;
		if (done % 25 === 0) process.stdout.write(`  ${done}/${rows.length}\n`);
		return { ...r, ...res } as Result;
	});

	const byStatus = new Map<string, Result[]>();
	for (const r of results) {
		const k = String(r.status);
		if (!byStatus.has(k)) byStatus.set(k, []);
		byStatus.get(k)!.push(r);
	}

	const summary = [...byStatus.entries()]
		.map(([s, list]) => ({ status: s, count: list.length }))
		.sort((a, b) => b.count - a.count);

	process.stdout.write(`\n=== Summary ===\n`);
	for (const s of summary) process.stdout.write(`  ${s.status.padEnd(8)} ${s.count}\n`);

	// Print non-2xx details
	for (const [status, list] of byStatus) {
		const n = Number(status);
		if (Number.isFinite(n) && n >= 200 && n < 300) continue;
		process.stdout.write(`\n=== ${status} (${list.length}) ===\n`);
		for (const r of list) {
			process.stdout.write(
				`  ${r.slug.padEnd(42)} isbn=${(r.isbn || '—').padEnd(13)}  ${r.url}\n`,
			);
		}
	}

	// Also flag Disney/Lumiere URLs with the fabricated-looking hash pattern,
	// regardless of status (some may serve a placeholder image instead of 404).
	const suspectPattern = /lumiere-a\.akamaihd\.net\/.*_[a-z0-9]{8}\.jpeg/i;
	const suspects = results.filter((r) => suspectPattern.test(r.url));
	if (suspects.length) {
		process.stdout.write(`\n=== Lumiere/Disney CDN rows (${suspects.length}) ===\n`);
		for (const r of suspects) {
			process.stdout.write(
				`  ${r.slug.padEnd(42)} status=${String(r.status).padEnd(8)} ${r.url}\n`,
			);
		}
	}

	writeFileSync(
		REPORT_PATH,
		JSON.stringify(
			{
				ran_at: new Date().toISOString(),
				total: results.length,
				summary,
				non_2xx: results.filter((r) => {
					const n = Number(r.status);
					return !(Number.isFinite(n) && n >= 200 && n < 300);
				}),
				lumiere_suspects: suspects,
			},
			null,
			2,
		),
	);
	process.stdout.write(`\nReport written to ${REPORT_PATH}\n`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
