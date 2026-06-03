/**
 * Restore the catalog from data/catalog-backup.csv into a database.
 *
 * Upserts on the uuid `id` so identities (and therefore user_books FKs) are
 * preserved. Intended for reconstituting an empty/fresh DB, or rolling a DB back
 * to the last committed backup. Prompts before writing to a non-local target.
 *
 * Local:       npm run catalog:restore
 * Production:  npm run catalog:restore -- --production   (asks to confirm)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseBackup } from '../lib/csv/backup';
import { isLocal, makeClient, resolveCredentials } from './_supabase';

const PROD = process.argv.includes('--production');
const SKIP_CONFIRM = process.argv.includes('--yes') || process.env.SEED_CONFIRM === 'yes';
const BACKUP = resolve(__dirname, '..', 'data', 'catalog-backup.csv');
const BATCH = 50;

async function confirm(url: string): Promise<void> {
	const ref = url.replace(/^https?:\/\//, '').split('.')[0];
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(
		`About to upsert catalog rows into NON-LOCAL project "${ref}". Type the project ref to continue: `,
	);
	rl.close();
	if (answer.trim() !== ref) {
		console.error('Mismatch — aborting.');
		process.exit(1);
	}
}

async function main(): Promise<void> {
	const { url } = resolveCredentials(PROD);
	const rows = parseBackup(readFileSync(BACKUP, 'utf-8'));
	if (!isLocal(url) && !SKIP_CONFIRM) await confirm(url);

	const supabase = makeClient(PROD);
	let written = 0;
	for (let i = 0; i < rows.length; i += BATCH) {
		const batch = rows.slice(i, i + BATCH);
		const { error } = await supabase.from('books').upsert(batch, { onConflict: 'id' });
		if (error) {
			console.error(`Restore failed at batch ${i / BATCH}: ${error.message}`);
			process.exit(1);
		}
		written += batch.length;
	}
	console.log(`Restored ${written} rows from data/catalog-backup.csv`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
