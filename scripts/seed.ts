/**
 * One-time CSV seed script for the books table.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars,
 * or defaults to local Supabase (http://127.0.0.1:54321).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_KEY =
	process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';

if (!SUPABASE_KEY) {
	// Try reading from .env file
	const envPath = resolve(__dirname, '..', '.env');
	try {
		const envContent = readFileSync(envPath, 'utf-8');
		const match = envContent.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/);
		if (match) {
			console.log(
				'Warning: Using anon key from .env — this only works if RLS is disabled or you use service_role key.',
			);
		}
	} catch {
		// .env doesn't exist, that's fine
	}

	console.error(
		'Error: SUPABASE_SERVICE_ROLE_KEY not set.\n' +
			'For local dev, run: supabase status\n' +
			'Then: SUPABASE_SERVICE_ROLE_KEY=<secret_key> npx tsx scripts/seed.ts',
	);
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- CSV Parsing ---

function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') {
			inQuotes = !inQuotes;
		} else if (c === ',' && !inQuotes) {
			result.push(current.trim());
			current = '';
		} else {
			current += c;
		}
	}
	result.push(current.trim());
	return result;
}

function parseDate(dateStr: string): string | null {
	if (!dateStr) return null;
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return null;
	return d.toISOString().split('T')[0];
}

function splitMultiValue(val: string): string[] {
	if (!val) return [];
	return val
		.split(/[;,]/)
		.map((s) => s.trim())
		.filter(Boolean)
		.filter((v, i, a) => a.indexOf(v) === i); // dedupe
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

// Publisher-direct URLs (penguin, scholastic, etc.) are usually higher-fidelity
// than the OL/Google Books fallbacks the pipeline emits. When the CSV already
// holds one, keep it. The pipeline's URL is reserved for slugs whose CSV cover
// is missing or is itself a generic OL/Google URL.
const PIPELINE_HOSTS = ['covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com'];

function isPipelineHostedCover(url: string | null | undefined): boolean {
	if (!url) return true;
	return PIPELINE_HOSTS.some((host) => url.includes(host));
}

function pickCoverImage(
	manualUrl: string | undefined,
	csvUrl: string | null,
	pipelineUrl: string | undefined,
): string | null {
	if (manualUrl) return manualUrl;
	if (csvUrl && !isPipelineHostedCover(csvUrl)) return csvUrl;
	// CSV's URL is itself an OL/Google one — don't fall back to it when the
	// pipeline produced no override. Better to render no cover than a known-
	// untrustworthy one. The user can fix specific cases via cover-manual-overrides.json.
	return pipelineUrl ?? null;
}

// --- Main ---

async function main() {
	const csvPath = resolve(__dirname, '..', 'data', 'books.csv');

	const isbnOverrides = mergeOverrides(
		loadOverrideFile<Record<string, string[]>>('isbn-overrides.json'),
		loadOverrideFile<Record<string, string[]>>('isbn-manual-overrides.json'),
	);
	const primaryIsbn = mergeOverrides(
		loadOverrideFile<Record<string, string>>('primary-isbn.json'),
		loadOverrideFile<Record<string, string>>('primary-isbn-manual-overrides.json'),
	);
	const pipelineCovers = loadOverrideFile<Record<string, string>>('cover-overrides.json');
	const manualCovers = loadOverrideFile<Record<string, string>>('cover-manual-overrides.json');
	// Slugs whose CSV ISBN OL has filed under a different book — pipeline
	// substituted the right ISBN by title-search, so the CSV's cover URL (often
	// keyed off the wrong CSV ISBN) shouldn't be preferred over the pipeline's.
	const rejectedSlugs = new Set(loadOverrideFile<string[] | Record<string, never>>('csv-isbn-rejected.json') as string[]);
	// format-overrides.json is emitted by the pipeline for inspection only — it
	// only sees formats OL tagged, which is sparser than CSV's curated list.
	// Manual overrides still apply for explicit corrections.
	const manualFormats = loadOverrideFile<Record<string, string[]>>('format-manual-overrides.json');

	const raw = readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, ''); // strip BOM

	const lines = raw.split('\n').filter((l) => l.trim());
	const headerLine = lines[0];
	const headers = parseCSVLine(headerLine);

	const col = (name: string) => {
		// Handle BOM in first header
		const idx = headers.findIndex(
			(h) => h === name || h === `\uFEFF${name}` || h.replace(/^\uFEFF/, '') === name,
		);
		if (idx === -1) throw new Error(`Column "${name}" not found. Headers: ${headers.join(', ')}`);
		return idx;
	};

	const seenSlugs = new Set<string>();
	const books: Record<string, unknown>[] = [];
	let skippedDuplicates = 0;

	for (let i = 1; i < lines.length; i++) {
		const fields = parseCSVLine(lines[i]);
		const slug = fields[col('slug')];

		// Skip true duplicates (same slug = same book)
		if (seenSlugs.has(slug)) {
			skippedDuplicates++;
			continue;
		}
		seenSlugs.add(slug);

		const seriesName = fields[col('series_name')] || null;
		const seriesOrder = fields[col('series_order')];
		const timelineOrder = fields[col('timeline_order')];

		const csvIsbn = fields[col('isbn')];
		const isbnList = isbnOverrides[slug] ?? (csvIsbn ? [csvIsbn] : []);

		const csvCover = fields[col('cover_image')] || null;
		// When the CSV ISBN itself is wrong, its keyed cover URL is also untrusted.
		const trustedCsvCover = rejectedSlugs.has(slug) ? null : csvCover;

		books.push({
			title: fields[col('title')],
			slug,
			author: splitMultiValue(fields[col('author')].replace(/;/g, ';')),
			cover_image: pickCoverImage(manualCovers[slug], trustedCsvCover, pipelineCovers[slug]),
			canon: fields[col('canon')], // "Canon" or "Legends"
			date_published: parseDate(fields[col('date_published')]),
			format: manualFormats[slug] ?? splitMultiValue(fields[col('format')]),
			isbn: isbnList,
			primary_isbn: primaryIsbn[slug] ?? isbnList[0] ?? null,
			language: fields[col('language')] || 'English',
			publisher: fields[col('publisher')] || null,
			series_name: seriesName,
			series_order: seriesOrder ? Number.parseInt(seriesOrder, 10) : null,
			timeline_order: timelineOrder ? Number.parseFloat(timelineOrder) : null,
			synopsis: fields[col('synopsis')] || null,
			type: fields[col('type')], // "Adult Novel", "YA Novel", "Middle Grade Novel"
			era: fields[col('era')] || null,
		});
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
