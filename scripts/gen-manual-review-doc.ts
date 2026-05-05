/**
 * Generate docs/plans/2026-05-05-data-manual-isbn-review-plan.md from
 * scripts/primary-isbn-verification.txt + the local books table.
 *
 * Usage: SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/gen-manual-review-doc.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_KEY) {
	console.error('SUPABASE_SERVICE_ROLE_KEY not set');
	process.exit(1);
}

const REPORT_PATH = resolve(__dirname, 'primary-isbn-verification.txt');
const OUT_PATH = resolve(
	__dirname,
	'..',
	'docs',
	'plans',
	'2026-05-05-data-manual-isbn-review-plan.md',
);

type Section = 'weak' | 'nodata';
type Entry = { ol: string | null; gb: string | null };

function parseReport(): { weak: Map<string, Entry>; nodata: Map<string, Entry> } {
	const text = readFileSync(REPORT_PATH, 'utf-8');
	const weak = new Map<string, Entry>();
	const nodata = new Map<string, Entry>();
	let mode: Section | '' = '';
	let lastSlug = '';
	for (const line of text.split('\n')) {
		if (line.startsWith('=== WEAK')) {
			mode = 'weak';
			continue;
		}
		if (line.startsWith('=== NO-DATA')) {
			mode = 'nodata';
			continue;
		}
		if (line.startsWith('=== ')) {
			mode = '';
			continue;
		}
		if (!mode) continue;
		// Weak section: "  <slug>" alone on a line, then OL: / GB: continuation lines.
		// No-data section: "  <slug>  <isbn>  (<title>)" on a single line.
		const slugAloneMatch = line.match(/^  ([a-z0-9-]+)$/);
		const slugWithIsbnMatch = line.match(/^  ([a-z0-9-]+)\s+\d{13}/);
		if (slugAloneMatch) {
			lastSlug = slugAloneMatch[1];
			(mode === 'weak' ? weak : nodata).set(lastSlug, { ol: null, gb: null });
			continue;
		}
		if (slugWithIsbnMatch && mode === 'nodata') {
			lastSlug = slugWithIsbnMatch[1];
			nodata.set(lastSlug, { ol: null, gb: null });
			continue;
		}
		const olMatch = line.match(/^    OL: (.+)$/);
		const gbMatch = line.match(/^    GB: (.+)$/);
		if ((olMatch || gbMatch) && lastSlug) {
			const target = mode === 'weak' ? weak : nodata;
			const entry = target.get(lastSlug);
			if (!entry) continue;
			if (olMatch) entry.ol = olMatch[1] === 'null' ? null : olMatch[1];
			if (gbMatch) entry.gb = gbMatch[1] === 'null' ? null : gbMatch[1];
		}
	}
	return { weak, nodata };
}

async function main() {
	const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
	const { data, error } = await supabase
		.from('books')
		.select('slug, title, author, primary_isbn, isbn')
		.order('title');
	if (error || !data) {
		console.error('DB query failed:', error);
		process.exit(1);
	}

	const { weak, nodata } = parseReport();
	const bySlug = new Map(data.map((b) => [b.slug, b]));

	const lines: string[] = [];
	lines.push('---');
	lines.push('title: "data: Manual ISBN review — books needing human verification"');
	lines.push('type: data');
	lines.push('date: 2026-05-05');
	lines.push('related: docs/plans/2026-05-05-feat-catalog-data-quality-pass-plan.md');
	lines.push('---');
	lines.push('');
	lines.push('# Manual ISBN Review');
	lines.push('');
	lines.push(
		"Books where the pipeline could not fully verify the primary_isbn against OpenLibrary + Google Books. **0 of these are provably wrong** — they're just unverifiable automatically. Most likely correct; flagged here for human review.",
	);
	lines.push('');
	lines.push('## Categories');
	lines.push('');
	lines.push(
		`- **Weak (${weak.size})**: one API disagrees, often because OL has a generic "Star Wars" record. Likely correct CSV ISBN; OL just has sparse metadata.`,
	);
	lines.push(
		`- **No-data (${nodata.size})**: neither API has the ISBN. Usually very new books (Acolyte tie-ins, THR Phase III) or older UK printings.`,
	);
	lines.push('');
	lines.push('## How to use this list');
	lines.push('');
	lines.push("1. Pick a row. Verify the ISBN at the publisher's site or Amazon.");
	lines.push('2. If ISBN is correct → no action.');
	lines.push(
		'3. If ISBN is wrong → update the row in [data/books.csv](../../data/books.csv), then re-run `npx tsx scripts/source-isbns.ts && npm run db:seed`.',
	);
	lines.push(
		'4. Optionally add a manual override to [data/isbn-manual-overrides.json](../../data/isbn-manual-overrides.json) (slug → [isbns…]; survives pipeline regen) and [data/cover-manual-overrides.json](../../data/cover-manual-overrides.json) (slug → cover URL).',
	);
	lines.push('');
	lines.push('## Weak (one API disagrees or has a generic record)');
	lines.push('');
	lines.push('| Slug | Title | Author | DB primary_isbn | OL says | GB says |');
	lines.push('|---|---|---|---|---|---|');
	for (const slug of [...weak.keys()].sort()) {
		const b = bySlug.get(slug);
		if (!b) continue;
		const author = (b.author ?? []).join(', ');
		const e = weak.get(slug);
		const ol = e?.ol ?? '—';
		const gb = e?.gb ?? '—';
		lines.push(
			`| ${slug} | ${b.title} | ${author} | \`${b.primary_isbn}\` | ${ol} | ${gb} |`,
		);
	}
	lines.push('');
	lines.push('## No-data (neither API has the ISBN)');
	lines.push('');
	lines.push('| Slug | Title | Author | DB primary_isbn |');
	lines.push('|---|---|---|---|');
	for (const slug of [...nodata.keys()].sort()) {
		const b = bySlug.get(slug);
		if (!b) continue;
		const author = (b.author ?? []).join(', ');
		lines.push(`| ${slug} | ${b.title} | ${author} | \`${b.primary_isbn}\` |`);
	}
	lines.push('');

	writeFileSync(OUT_PATH, lines.join('\n'));
	console.log(`Wrote ${OUT_PATH}`);
	console.log(`  weak: ${weak.size}`);
	console.log(`  no-data: ${nodata.size}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
