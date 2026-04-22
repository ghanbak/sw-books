/**
 * One-time CSV seed script for the books table.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars,
 * or defaults to local Supabase (http://127.0.0.1:54321).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_KEY =
	process.env.SUPABASE_SERVICE_ROLE_KEY ??
	process.env.SUPABASE_SERVICE_KEY ??
	'';

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

// --- Main ---

async function main() {
	const csvPath = resolve(__dirname, '..', 'data', 'books.csv');
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

		books.push({
			title: fields[col('title')],
			slug,
			author: splitMultiValue(fields[col('author')].replace(/;/g, ';')),
			cover_image: fields[col('cover_image')] || null,
			canon: fields[col('canon')], // "Canon" or "Legends"
			date_published: parseDate(fields[col('date_published')]),
			format: splitMultiValue(fields[col('format')]),
			isbn: fields[col('isbn')] ? [fields[col('isbn')]] : [],
			language: fields[col('language')] || 'English',
			publisher: fields[col('publisher')] || null,
			series_name: seriesName,
			series_order: seriesOrder ? Number.parseInt(seriesOrder, 10) : null,
			timeline_order: timelineOrder ? Number.parseFloat(timelineOrder) : null,
			synopsis: fields[col('synopsis')] || null,
			type: fields[col('type')], // "Adult Novel", "YA Novel", "Middle Grade Novel"
			asin: fields[col('asin')] || null,
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
