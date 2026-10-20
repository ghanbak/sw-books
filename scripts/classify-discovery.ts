/**
 * Phase 2 runner: match + classify the discovered novels against the catalog.
 *
 *   npx tsx scripts/classify-discovery.ts              # match vs the LOCAL DB
 *   npx tsx scripts/classify-discovery.ts --production # match vs the PROD DB
 *   npx tsx scripts/classify-discovery.ts --dev        # match vs data/books.csv
 *
 * The authoritative catalog is the live DB (reconcile against the system of
 * record, not the frozen CSV). When no Supabase credentials are set, or the DB
 * is unreachable, the script falls back to a clearly-labeled DEV classification
 * against data/books.csv and prints a warning that the authoritative run must be
 * done locally against the DB.
 *
 * Read-only: this script NEVER writes to the DB or to any CSV. It prints a
 * report (counts per class, DIFFERS field suggestions, samples, and the two
 * informational "not in the other set" lists). Promotion is Phase 3.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { type CatalogOverrides, buildBookFields } from '../lib/catalog';
import { parseCsv } from '../lib/csv/read';
import type { Database } from '../lib/types';
import {
	type CatalogBook,
	type Classification,
	type MatchClass,
	classify,
	unmatchedCatalog,
} from '../lib/wookieepedia/match';
import { loadDiscovered } from './lib/load-discovered';

const ROOT = resolve(__dirname, '..');
const BOOKS_CSV = resolve(ROOT, 'data', 'books.csv');

const PROD = process.argv.includes('--production');
const FORCE_DEV = process.argv.includes('--dev');

// --- Loading the catalog ------------------------------------------------------

function loadJson<T>(file: string, fallback: T): T {
	try {
		return JSON.parse(readFileSync(resolve(ROOT, 'data', file), 'utf-8')) as T;
	} catch {
		return fallback;
	}
}

/** The same override layering the seed uses, so dev-mode ISBN arrays are faithful. */
function loadCatalogFromCsv(): CatalogBook[] {
	const overrides: CatalogOverrides = {
		isbn: {
			...loadJson<Record<string, string[]>>('isbn-overrides.json', {}),
			...loadJson<Record<string, string[]>>('isbn-manual-overrides.json', {}),
		},
		primaryIsbn: {
			...loadJson<Record<string, string>>('primary-isbn.json', {}),
			...loadJson<Record<string, string>>('primary-isbn-manual-overrides.json', {}),
		},
		pipelineCovers: loadJson<Record<string, string>>('cover-overrides.json', {}),
		manualCovers: loadJson<Record<string, string>>('cover-manual-overrides.json', {}),
		rejectedSlugs: new Set(loadJson<string[]>('csv-isbn-rejected.json', [])),
		manualFormats: loadJson<Record<string, string[]>>('format-manual-overrides.json', {}),
	};
	const records = parseCsv(readFileSync(BOOKS_CSV, 'utf-8'));
	const seen = new Set<string>();
	const out: CatalogBook[] = [];
	for (const rec of records) {
		const fields = buildBookFields(rec, overrides);
		if (seen.has(fields.slug)) continue;
		seen.add(fields.slug);
		out.push(fields);
	}
	return out;
}

type CatalogSource = { label: string; books: CatalogBook[]; authoritative: boolean };

/** Try the live DB; on any failure fall back to a labeled dev-mode CSV load. */
async function loadCatalog(): Promise<CatalogSource> {
	if (FORCE_DEV) {
		return { label: 'DEV (data/books.csv)', books: loadCatalogFromCsv(), authoritative: false };
	}

	const url = PROD
		? (loadEnvFile('.env.production').SUPABASE_URL ?? process.env.SUPABASE_URL ?? '')
		: (process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321');
	const key = PROD
		? (loadEnvFile('.env.production').SUPABASE_SERVICE_ROLE_KEY ??
			process.env.SUPABASE_SERVICE_ROLE_KEY ??
			'')
		: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '');

	if (!url || !key) {
		console.warn(
			`\n[dev-mode] No Supabase ${PROD ? 'production ' : ''}credentials found — classifying against data/books.csv instead.\n          The AUTHORITATIVE run must target the DB locally (SUPABASE_SERVICE_ROLE_KEY=<secret> npm run db:… ; sandbox cannot run it).`,
		);
		return { label: 'DEV (data/books.csv)', books: loadCatalogFromCsv(), authoritative: false };
	}

	try {
		const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });
		const { data, error } = await supabase.from('books').select('*');
		if (error) throw new Error(error.message);
		const books = (data ?? []) as unknown as CatalogBook[];
		return { label: `DB (${url})`, books, authoritative: true };
	} catch (err) {
		console.warn(
			`\n[dev-mode] DB unreachable (${err instanceof Error ? err.message : String(err)}) — falling back to data/books.csv.\n          The AUTHORITATIVE run must target the DB locally.`,
		);
		return { label: 'DEV (data/books.csv)', books: loadCatalogFromCsv(), authoritative: false };
	}
}

function loadEnvFile(name: string): Record<string, string> {
	const out: Record<string, string> = {};
	try {
		for (const line of readFileSync(resolve(ROOT, name), 'utf-8').split('\n')) {
			const t = line.trim();
			if (!t || t.startsWith('#')) continue;
			const i = t.indexOf('=');
			if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
		}
	} catch {
		// absent — fall through
	}
	return out;
}

// --- Reporting ----------------------------------------------------------------

const CLASS_ORDER: readonly MatchClass[] = ['NEW', 'MATCHED', 'DIFFERS', 'AMBIGUOUS'];

function byTitle(a: Classification, b: Classification): number {
	const x = a.discovered.title;
	const y = b.discovered.title;
	return x < y ? -1 : x > y ? 1 : 0;
}

function report(results: Classification[], src: CatalogSource, catalog: CatalogBook[]): void {
	const w = process.stdout.write.bind(process.stdout);

	w('\n═══ Discovery classification ═══\n');
	w(`Catalog source: ${src.label}${src.authoritative ? '' : '  ⚠️  NOT AUTHORITATIVE'}\n`);
	w(`Discovered rows: ${results.length}   Catalog rows: ${catalog.length}\n\n`);

	const byClass = new Map<MatchClass, Classification[]>();
	for (const c of CLASS_ORDER) byClass.set(c, []);
	for (const r of results) byClass.get(r.class)?.push(r);

	w('Counts per class:\n');
	for (const c of CLASS_ORDER) {
		w(`  ${c.padEnd(10)} ${String(byClass.get(c)?.length ?? 0).padStart(4)}\n`);
	}

	// DIFFERS — list every row with its differing wiki-owned fields.
	const differs = (byClass.get('DIFFERS') ?? []).slice().sort(byTitle);
	w(`\nDIFFERS (${differs.length}) — wiki-owned fields that differ (suggestions, not applied):\n`);
	for (const r of differs) {
		w(`  • ${r.discovered.title}  [${r.discovered.canon}] → ${r.matchSlug} (${r.method})\n`);
		for (const d of r.diffs) {
			w(`      ${d.field}: catalog "${d.catalog}"  ⇐ wiki "${d.discovered}"\n`);
		}
	}

	// AMBIGUOUS — show why + candidates (operator must resolve).
	const ambiguous = (byClass.get('AMBIGUOUS') ?? []).slice().sort(byTitle);
	w(`\nAMBIGUOUS (${ambiguous.length}) — need operator review:\n`);
	for (const r of ambiguous) {
		w(`  • ${r.discovered.title}  [${r.discovered.canon}] (${r.method}) — ${r.reason}\n`);
		w(`      candidates: ${r.candidates.join(', ') || '—'}\n`);
	}

	// Samples of each class.
	w('\nSamples (up to 5 per class):\n');
	for (const c of CLASS_ORDER) {
		const rows = (byClass.get(c) ?? []).slice().sort(byTitle).slice(0, 5);
		w(`  ${c}:\n`);
		for (const r of rows) {
			const extra =
				c === 'NEW'
					? ` → proposed slug "${r.proposedSlug}"`
					: r.matchSlug
						? ` → ${r.matchSlug}`
						: r.candidates.length
							? ` → [${r.candidates.join(', ')}]`
							: '';
			w(`    - ${r.discovered.title} [${r.discovered.canon}]${extra}\n`);
		}
	}

	// Informational: discovered-but-unmatched (candidate NEW).
	const news = (byClass.get('NEW') ?? []).slice().sort(byTitle);
	w(`\nDiscovered but UNMATCHED — candidate NEW inserts (${news.length}):\n`);
	for (const r of news) {
		w(`  + ${r.discovered.title} [${r.discovered.canon}] → ${r.proposedSlug}\n`);
	}

	// Informational: catalog rows absent from the discovery set.
	const leftover = unmatchedCatalog(results, catalog)
		.slice()
		.sort((a, b) => {
			const x = a.title ?? '';
			const y = b.title ?? '';
			return x < y ? -1 : x > y ? 1 : 0;
		});
	w(`\nIn catalog but NOT in discovery (informational, ${leftover.length}):\n`);
	for (const c of leftover) {
		w(`  - ${c.title} [${c.canon}] (${c.slug})\n`);
	}
	w('\n');
}

async function main(): Promise<void> {
	const discovered = loadDiscovered();
	const src = await loadCatalog();
	const results = classify(discovered, src.books);
	report(results, src, src.books);
	if (!src.authoritative) {
		process.stdout.write(
			'NOTE: dev-mode result against data/books.csv — re-run against the live DB ' +
				'locally for the authoritative classification.\n',
		);
	}
}

main().catch((err) => {
	console.error(`\n${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
