/**
 * Apply the 25 cover URL replacements from scripts/cover-replacements.json
 * to data/books.csv, and fix the `thrawn-ascendancy-lesser-evil` row's
 * ISBN collision with `light-of-the-jedi` (both previously shared 9780593157718).
 *
 * Idempotent: re-running after the first patch produces no changes.
 * Does string replacements scoped to each affected line — no CSV round-trip,
 * so quoting and formatting of other columns is preserved byte-for-byte.
 *
 * Usage:
 *   npx tsx scripts/audit-covers.ts
 *   npx tsx scripts/source-cover-replacements.ts
 *   npx tsx scripts/apply-cover-replacements.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const CSV_PATH = resolve(__dirname, '..', 'data', 'books.csv');
const REPLACEMENTS_PATH = resolve(__dirname, 'cover-replacements.json');
const AUDIT_PATH = resolve(__dirname, 'cover-audit-report.json');

type Replacement = { newUrl: string | null; source: string; note?: string };

// Rows where the CSV ISBN itself is wrong (collision or bogus). Each entry's line
// gets scoped string replacements beyond the cover URL fix from cover-replacements.json.
// The optional asinAnd10 substring matches both the 9-char asin field AND the
// ISBN-10 tail inside the amazon URL (since asin is contained in "0{asin}").
type CollisionFix = {
	slugMarker: string;
	description: string;
	oldIsbn13: string;
	newIsbn13: string;
	oldAsinAnd10?: string;
	newAsinAnd10?: string;
};

const COLLISION_FIXES: CollisionFix[] = [
	{
		slugMarker: ',thrawn-ascendancy-lesser-evil,',
		description: 'Thrawn Ascendancy: Lesser Evil was sharing Light of the Jedi ISBN (9780593157718)',
		oldIsbn13: '9780593157718',
		newIsbn13: '9780593158326',
		oldAsinAnd10: '593157710',
		newAsinAnd10: '593158326',
	},
	{
		slugMarker: ',i-jedi,',
		description: 'I, Jedi had a bogus ISBN (9780553572986) — corrected to Bantam 1998 hc',
		oldIsbn13: '9780553572986',
		newIsbn13: '9780553108200',
	},
	{
		slugMarker: ',hand-of-thrawn-specter,',
		description: 'Specter of the Past had the same bogus ISBN as I, Jedi — corrected to Bantam 1997 pb',
		oldIsbn13: '9780553572986',
		newIsbn13: '9780553298048',
	},
];

function main() {
	const raw = readFileSync(CSV_PATH, 'utf-8');
	const replacements = JSON.parse(readFileSync(REPLACEMENTS_PATH, 'utf-8')) as Record<string, Replacement>;
	const audit = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8')) as {
		non_2xx: Array<{ slug: string; url: string }>;
	};

	const oldUrlBySlug: Record<string, string> = {};
	for (const r of audit.non_2xx) oldUrlBySlug[r.slug] = r.url;

	// Stage 1: cover URL replacements — safe as global substring replaces because
	// every broken URL has a unique fabricated hash or ASIN suffix.
	let patched = raw;
	const applied: Array<{ slug: string; source: string }> = [];
	const skipped: string[] = [];

	for (const [slug, rep] of Object.entries(replacements)) {
		if (!rep.newUrl) {
			skipped.push(`${slug} (no replacement in json)`);
			continue;
		}
		const oldUrl = oldUrlBySlug[slug];
		if (!oldUrl) {
			skipped.push(`${slug} (no audit entry)`);
			continue;
		}
		if (!patched.includes(oldUrl)) {
			skipped.push(`${slug} (already patched)`);
			continue;
		}
		patched = patched.replace(oldUrl, rep.newUrl);
		applied.push({ slug, source: rep.source });
	}

	// Stage 2: collision fixes — scoped per line, multiple field updates.
	const lines = patched.split('\n');
	const collisionStatus: Array<{ fix: CollisionFix; state: 'applied' | 'already' | 'missing' }> = [];
	for (const fix of COLLISION_FIXES) {
		let found = false;
		for (let i = 0; i < lines.length; i++) {
			if (!lines[i].includes(fix.slugMarker)) continue;
			found = true;
			const hasOldIsbn = lines[i].includes(fix.oldIsbn13);
			const hasNewIsbn = lines[i].includes(fix.newIsbn13);
			if (!hasOldIsbn && hasNewIsbn) {
				collisionStatus.push({ fix, state: 'already' });
				break;
			}
			let next = lines[i].split(fix.oldIsbn13).join(fix.newIsbn13);
			if (fix.oldAsinAnd10 && fix.newAsinAnd10) {
				next = next.split(fix.oldAsinAnd10).join(fix.newAsinAnd10);
			}
			lines[i] = next;
			collisionStatus.push({ fix, state: 'applied' });
			break;
		}
		if (!found) collisionStatus.push({ fix, state: 'missing' });
	}
	patched = lines.join('\n');

	if (patched === raw) {
		process.stdout.write('No changes. CSV already up to date.\n');
		return;
	}

	writeFileSync(CSV_PATH, patched);

	process.stdout.write(`\n=== Cover replacements applied (${applied.length}) ===\n`);
	const bySource: Record<string, number> = {};
	for (const a of applied) bySource[a.source] = (bySource[a.source] || 0) + 1;
	for (const [s, n] of Object.entries(bySource)) process.stdout.write(`  ${s.padEnd(16)} ${n}\n`);

	if (skipped.length) {
		process.stdout.write(`\n=== Skipped (${skipped.length}) ===\n`);
		for (const s of skipped) process.stdout.write(`  ${s}\n`);
	}

	process.stdout.write(`\n=== Collision fixes (${collisionStatus.length}) ===\n`);
	for (const { fix, state } of collisionStatus) {
		const slug = fix.slugMarker.replace(/,/g, '');
		process.stdout.write(`  [${state}] ${slug}: ${fix.description}\n`);
		if (state === 'applied') {
			process.stdout.write(`    isbn ${fix.oldIsbn13} -> ${fix.newIsbn13}\n`);
			if (fix.oldAsinAnd10 && fix.newAsinAnd10) {
				process.stdout.write(`    asin/amazon ${fix.oldAsinAnd10} -> ${fix.newAsinAnd10}\n`);
			}
		}
	}

	process.stdout.write(`\nCSV written: ${CSV_PATH}\nReview: git diff data/books.csv\n`);
}

main();
