/**
 * CSV seed script for the books table (upsert on slug). LOCAL ONLY.
 *
 *   npm run db:seed     (SUPABASE_SERVICE_ROLE_KEY in env; local stack)
 *
 * The production DB is the catalog source of truth and data/books.csv is frozen,
 * so this refuses `--production` (npm run db:seed:prod) and any non-local
 * SUPABASE_URL before reading credentials or connecting — see lib/seed-guard.ts.
 * Prod recovery: `npm run catalog:restore -- --production`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { type CatalogOverrides, buildBookFields } from '../lib/catalog';
import { parseCsv } from '../lib/csv/read';
import { seedRefusal } from '../lib/seed-guard';

function refuseIf(message: string | null): void {
	if (message === null) return;
	console.error(message);
	process.exit(1);
}

function resolveCredentials(): { url: string; key: string } {
	const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
	if (!key) {
		console.error(
			'Error: SUPABASE_SERVICE_ROLE_KEY not set.\n' +
				'For local dev, run: supabase status\n' +
				'Then: SUPABASE_SERVICE_ROLE_KEY=<secret_key> npm run db:seed',
		);
		process.exit(1);
	}
	return { url, key };
}

// Load JSON override file produced by scripts/source-isbns.ts. Returns an empty
// object if the file is missing or invalid — seed degrades to CSV-only.
function loadOverrideFile<T>(filename: string): T {
	const path = resolve(__dirname, '..', 'data', filename);
	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as T;
	} catch {
		return {} as T;
	}
}

// Manual overrides win over pipeline-generated ones. Same shape, merged shallow.
function mergeOverrides<T>(
	generated: Record<string, T>,
	manual: Record<string, T>,
): Record<string, T> {
	return { ...generated, ...manual };
}

// --- Main ---

async function main() {
	// Before any credential read or connection.
	refuseIf(seedRefusal(process.argv));
	const { url, key } = resolveCredentials();
	refuseIf(seedRefusal(process.argv, url));
	const supabase = createClient(url, key);
	console.log(`Seeding LOCAL: ${url}\n`);

	const csvPath = resolve(__dirname, '..', 'data', 'books.csv');

	const overrides: CatalogOverrides = {
		isbn: mergeOverrides(
			loadOverrideFile<Record<string, string[]>>('isbn-overrides.json'),
			loadOverrideFile<Record<string, string[]>>('isbn-manual-overrides.json'),
		),
		primaryIsbn: mergeOverrides(
			loadOverrideFile<Record<string, string>>('primary-isbn.json'),
			loadOverrideFile<Record<string, string>>('primary-isbn-manual-overrides.json'),
		),
		pipelineCovers: loadOverrideFile<Record<string, string>>('cover-overrides.json'),
		manualCovers: loadOverrideFile<Record<string, string>>('cover-manual-overrides.json'),
		// Slugs whose CSV ISBN OL filed under a different book — distrust the CSV cover.
		rejectedSlugs: new Set(
			loadOverrideFile<string[] | Record<string, never>>('csv-isbn-rejected.json') as string[],
		),
		// format-overrides.json is pipeline inspection-only; seed uses manual ?? CSV.
		manualFormats: loadOverrideFile<Record<string, string[]>>('format-manual-overrides.json'),
	};

	const records = parseCsv(readFileSync(csvPath, 'utf-8'));

	const seenSlugs = new Set<string>();
	const books: Record<string, unknown>[] = [];
	let skippedDuplicates = 0;

	for (const rec of records) {
		const fields = buildBookFields(rec, overrides);

		// Skip true duplicates (same slug = same book)
		if (seenSlugs.has(fields.slug)) {
			skippedDuplicates++;
			continue;
		}
		seenSlugs.add(fields.slug);
		books.push(fields);
	}

	console.log(`Parsed ${books.length} unique books (skipped ${skippedDuplicates} duplicates)`);

	// Upsert in batches of 50
	const BATCH_SIZE = 50;
	let inserted = 0;

	for (let i = 0; i < books.length; i += BATCH_SIZE) {
		const batch = books.slice(i, i + BATCH_SIZE);
		const { error } = await supabase.from('books').upsert(batch, {
			onConflict: 'slug',
			ignoreDuplicates: false,
		});

		if (error) {
			console.error(`Error inserting batch at index ${i}:`, error.message);
			console.error('First row in batch:', JSON.stringify(batch[0], null, 2));
			process.exit(1);
		}

		inserted += batch.length;
		console.log(`  Inserted ${inserted}/${books.length}`);
	}

	console.log(`\nDone! ${inserted} books seeded.`);

	// Verify
	const { count } = await supabase.from('books').select('*', { count: 'exact', head: true });
	console.log(`Verification: ${count} books in database`);
}

main().catch((err) => {
	console.error('Seed failed:', err);
	process.exit(1);
});
