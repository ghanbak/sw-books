/**
 * Apply scripts/cover-resource-map.json to data/books.csv:
 *   - Replace cover_image for each change (oldUrl → newUrl on that slug's line).
 *   - Null out cover_image for each missing entry so the app's built-in
 *     title/color fallback renders.
 *   - Remove any duplicate rows (same slug appearing more than once), keeping
 *     the first occurrence.
 *
 * Idempotent: re-running on an already-applied CSV is a no-op.
 *
 * Usage:
 *   npx tsx scripts/refresh-covers.ts
 *   npx tsx scripts/apply-cover-refresh.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const CSV_PATH = resolve(__dirname, '..', 'data', 'books.csv');
const MAP_PATH = resolve(__dirname, 'cover-resource-map.json');

type Change = { slug: string; oldUrl: string; newUrl: string; source: string; md5: string };
type Missing = { slug: string; oldUrl: string };
type Map = { changes: Change[]; missing_list: Missing[] };

function main() {
	const raw = readFileSync(CSV_PATH, 'utf-8');
	const map = JSON.parse(readFileSync(MAP_PATH, 'utf-8')) as Map;
	const lines = raw.split('\n');

	// Stage 1: URL replacements (scoped per slug line so we don't accidentally
	// touch an identical URL on a different row).
	let replaced = 0;
	let alreadyReplaced = 0;
	let notFound: string[] = [];
	for (const c of map.changes) {
		const marker = `,${c.slug},`;
		let hit = false;
		for (let i = 0; i < lines.length; i++) {
			if (!lines[i].includes(marker)) continue;
			hit = true;
			if (lines[i].includes(c.newUrl)) {
				alreadyReplaced++;
				break;
			}
			if (!lines[i].includes(c.oldUrl)) {
				// oldUrl not on line — maybe normalized differently; skip with warning
				notFound.push(c.slug);
				break;
			}
			lines[i] = lines[i].split(c.oldUrl).join(c.newUrl);
			replaced++;
			break;
		}
		if (!hit) notFound.push(c.slug);
	}

	// Stage 2: null out missing covers (remove the URL, leave the field empty).
	let nulled = 0;
	let alreadyNulled = 0;
	for (const m of map.missing_list) {
		const marker = `,${m.slug},`;
		for (let i = 0; i < lines.length; i++) {
			if (!lines[i].includes(marker)) continue;
			if (!lines[i].includes(m.oldUrl)) {
				alreadyNulled++;
				break;
			}
			// Replace `,oldUrl,` with `,,` — the cover_image column becomes empty.
			lines[i] = lines[i].split(m.oldUrl).join('');
			nulled++;
			break;
		}
	}

	// Stage 3: dedupe rows by slug (keep first occurrence).
	const seenSlugs = new Set<string>();
	const dedupedLines: string[] = [];
	const removedDupes: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (i === 0 || !line.trim()) {
			dedupedLines.push(line);
			continue;
		}
		// slug is the 3rd column (0-indexed 2). Simple extract: assume no quotes in
		// title/id, which matches the current CSV shape.
		const match = line.match(/^[^,]*,[^,]*,([^,]+),/);
		const slug = match?.[1];
		if (!slug) {
			dedupedLines.push(line);
			continue;
		}
		if (seenSlugs.has(slug)) {
			removedDupes.push(slug);
			continue;
		}
		seenSlugs.add(slug);
		dedupedLines.push(line);
	}

	const patched = dedupedLines.join('\n');
	if (patched === raw) {
		process.stdout.write('No changes. CSV already up to date.\n');
		return;
	}

	writeFileSync(CSV_PATH, patched);

	process.stdout.write('=== Cover refresh applied ===\n');
	process.stdout.write(`  replaced         : ${replaced}\n`);
	process.stdout.write(`  already replaced : ${alreadyReplaced}\n`);
	process.stdout.write(`  nulled           : ${nulled}\n`);
	process.stdout.write(`  already nulled   : ${alreadyNulled}\n`);
	process.stdout.write(`  dupes removed    : ${removedDupes.length}\n`);
	if (removedDupes.length) {
		for (const s of removedDupes) process.stdout.write(`    - ${s}\n`);
	}
	if (notFound.length) {
		process.stdout.write('  not found        :\n');
		for (const s of notFound) process.stdout.write(`    - ${s}\n`);
	}
	process.stdout.write(`\nCSV written: ${CSV_PATH}\nReview: git diff data/books.csv\n`);
}

main();
