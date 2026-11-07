/**
 * Read-only catalog health check over the live-catalog mirror
 * `data/catalog-backup.csv` (not the frozen `data/books.csv`).
 *
 * Usage:
 *   npm run catalog:health            # offline checks only
 *   npm run catalog:health -- --head  # also HEAD every cover URL
 *
 * Never writes data and never touches Supabase. Check logic and the
 * error/warning split live in `lib/catalog-health.ts`:
 *
 *   error   duplicate slug · ISBN on 2+ books · invalid/malformed ISBN-10/13 ·
 *           primary_isbn not in isbn[] · (--head) cover 4xx/5xx or non-image
 *   warning shared cover URL · null cover · null synopsis ·
 *           (--head) cover < 2 KB (placeholder) or host unreachable
 *
 * Exit code: 1 when any error is found, 0 otherwise (warnings never fail).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	type CoverProbe,
	type Finding,
	classifyCoverProbe,
	runOfflineChecks,
	summarize,
} from '../lib/catalog-health';
import { parseBackup } from '../lib/csv/backup';

const CSV_PATH = resolve(__dirname, '..', 'data', 'catalog-backup.csv');
const CONCURRENCY = 8;
const TIMEOUT_MS = 8000;

/** Total size from `Content-Range: bytes 0-0/12345`, else Content-Length. */
function bodySize(res: Response): number | null {
	const range = res.headers.get('content-range');
	const total = range?.match(/\/(\d+)\s*$/)?.[1];
	if (total) return Number.parseInt(total, 10);
	const len = res.headers.get('content-length');
	return len ? Number.parseInt(len, 10) : null;
}

async function probe(url: string): Promise<CoverProbe> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
	try {
		// Some CDNs reject HEAD; fall back to a 1-byte ranged GET.
		let res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
		if (res.status === 403 || res.status === 405) {
			res = await fetch(url, {
				method: 'GET',
				signal: ctrl.signal,
				redirect: 'follow',
				headers: { Range: 'bytes=0-0' },
			});
			await res.body?.cancel();
		}
		return {
			kind: 'response',
			status: res.status,
			contentType: res.headers.get('content-type'),
			contentLength: bodySize(res),
		};
	} catch (e) {
		const err = e as Error;
		return { kind: 'network-error', detail: err.name === 'AbortError' ? 'timeout' : err.message };
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

function print(findings: Finding[]): void {
	for (const severity of ['error', 'warning'] as const) {
		const list = findings.filter((f) => f.severity === severity);
		if (list.length === 0) continue;
		process.stdout.write(`\n=== ${severity.toUpperCase()}S (${list.length}) ===\n`);
		const byCheck = Map.groupBy(list, (f) => f.check);
		for (const [check, group] of byCheck) {
			process.stdout.write(`\n[${check}]\n`);
			for (const f of group) process.stdout.write(`  ${f.message}\n`);
		}
	}
}

async function main(): Promise<void> {
	const withHead = process.argv.includes('--head');
	const rows = parseBackup(readFileSync(CSV_PATH, 'utf-8'));
	process.stdout.write(`catalog:health — ${rows.length} rows from data/catalog-backup.csv\n`);

	const findings = runOfflineChecks(rows);

	if (withHead) {
		const covers = rows.filter((r) => r.cover_image?.trim());
		process.stdout.write(`Probing ${covers.length} cover URLs (concurrency ${CONCURRENCY})\n`);
		const probed = await runPool(covers, CONCURRENCY, async (r) => {
			const url = (r.cover_image as string).trim();
			return classifyCoverProbe(r.slug, url, await probe(url));
		});
		for (const f of probed) if (f) findings.push(f);
	}

	print(findings);

	const { errors, warnings, byCheck } = summarize(findings);
	process.stdout.write('\n=== Summary ===\n');
	for (const [check, n] of Object.entries(byCheck)) {
		process.stdout.write(`  ${check.padEnd(22)} ${n}\n`);
	}
	process.stdout.write(`  errors: ${errors}  warnings: ${warnings}\n`);
	process.exitCode = errors > 0 ? 1 : 0;
}

main().catch((e) => {
	console.error(e);
	process.exit(2);
});
