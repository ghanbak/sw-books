/**
 * Download every cover_image in data/books.csv, MD5 the bytes, and cluster.
 * Any MD5 shared across two or more books is a placeholder ("coming soon",
 * "no image", etc.). Also flags very small payloads (< 2 KB) as suspicious.
 *
 * Output: scripts/placeholder-report.json
 *
 * Usage:
 *   npx tsx scripts/detect-placeholder-covers.ts
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv } from '../lib/csv/read';
import { fetchWithRetry } from '../lib/sources/fetch-retry';

const CSV_PATH = resolve(__dirname, '..', 'data', 'books.csv');
const OUT_PATH = resolve(__dirname, 'placeholder-report.json');
const CONCURRENCY = 8;
const SMALL_BYTES = 2048;

type Row = { title: string; slug: string; isbn: string; url: string };
type Result = Row & {
	bytes: number;
	md5: string | null;
	contentType: string | null;
	note?: string;
};

function loadRows(): Row[] {
	const records = parseCsv(readFileSync(CSV_PATH, 'utf-8'));
	const rows: Row[] = [];
	for (const rec of records) {
		const url = (rec.cover_image ?? '').trim();
		if (!url) continue;
		rows.push({
			title: (rec.title ?? '').trim(),
			slug: (rec.slug ?? '').trim(),
			isbn: (rec.isbn ?? '').trim(),
			url,
		});
	}
	return rows;
}

async function fetchBytes(
	url: string,
): Promise<{ bytes: Buffer | null; contentType: string | null; note?: string }> {
	try {
		const res = await fetchWithRetry(url, { redirect: 'follow' }, { retries: 2 });
		const ct = res.headers.get('content-type');
		if (!res.ok) {
			return { bytes: null, contentType: ct, note: `HTTP ${res.status}` };
		}
		const ab = await res.arrayBuffer();
		return { bytes: Buffer.from(ab), contentType: ct };
	} catch (e) {
		return { bytes: null, contentType: null, note: (e as Error).message };
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
	process.stdout.write(`Hashing ${rows.length} cover URLs (concurrency ${CONCURRENCY})\n`);

	let done = 0;
	const results: Result[] = await runPool(rows, CONCURRENCY, async (r) => {
		const { bytes, contentType, note } = await fetchBytes(r.url);
		done++;
		if (done % 25 === 0) process.stdout.write(`  ${done}/${rows.length}\n`);
		return {
			...r,
			bytes: bytes?.length ?? 0,
			md5: bytes ? createHash('md5').update(bytes).digest('hex') : null,
			contentType,
			note,
		};
	});

	// Cluster by md5
	const byMd5 = new Map<string, Result[]>();
	for (const r of results) {
		if (!r.md5) continue;
		if (!byMd5.has(r.md5)) byMd5.set(r.md5, []);
		byMd5.get(r.md5)!.push(r);
	}

	const duplicateClusters = [...byMd5.entries()]
		.filter(([, list]) => list.length > 1)
		.map(([md5, list]) => ({
			md5,
			bytes: list[0].bytes,
			count: list.length,
			slugs: list.map((r) => r.slug),
		}))
		.sort((a, b) => b.count - a.count);

	const tinyPayloads = results.filter((r) => r.md5 && r.bytes > 0 && r.bytes < SMALL_BYTES);
	const fetchErrors = results.filter((r) => !r.md5);

	process.stdout.write('\n=== Duplicate-content clusters (likely placeholders) ===\n');
	for (const c of duplicateClusters) {
		process.stdout.write(`  md5=${c.md5}  bytes=${c.bytes}  shared by ${c.count} books:\n`);
		for (const s of c.slugs) process.stdout.write(`    - ${s}\n`);
	}
	if (duplicateClusters.length === 0) process.stdout.write('  (none)\n');

	if (tinyPayloads.length) {
		process.stdout.write(`\n=== Tiny payloads (<${SMALL_BYTES} bytes, suspicious) ===\n`);
		for (const r of tinyPayloads) {
			process.stdout.write(`  ${r.slug.padEnd(42)} bytes=${r.bytes}  ${r.url}\n`);
		}
	}

	if (fetchErrors.length) {
		process.stdout.write(`\n=== Fetch errors (${fetchErrors.length}) ===\n`);
		for (const r of fetchErrors) {
			process.stdout.write(`  ${r.slug.padEnd(42)} ${r.note ?? 'unknown'}  ${r.url}\n`);
		}
	}

	writeFileSync(
		OUT_PATH,
		JSON.stringify(
			{
				ran_at: new Date().toISOString(),
				total: results.length,
				duplicate_clusters: duplicateClusters,
				tiny_payloads: tinyPayloads.map((r) => ({ slug: r.slug, bytes: r.bytes, url: r.url })),
				fetch_errors: fetchErrors.map((r) => ({ slug: r.slug, note: r.note, url: r.url })),
			},
			null,
			2,
		),
	);
	process.stdout.write(`\nReport: ${OUT_PATH}\n`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
