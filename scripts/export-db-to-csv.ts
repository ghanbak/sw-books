/**
 * Export the catalog from the database to data/catalog-backup.csv.
 *
 * Once the DB is the source of truth, this is the one-directional, deterministic
 * backup (rollback + dev-seed source). Read-only against the DB.
 *
 * Local:       npm run catalog:export        (SUPABASE_SERVICE_ROLE_KEY in env)
 * Production:  npm run catalog:export:prod   (creds from .env.production)
 * Commit too:  npm run catalog:backup        (export:prod + git commit if changed)
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serializeBackup } from '../lib/csv/backup';
import { makeClient } from './_supabase';

const PROD = process.argv.includes('--production');
const OUT = resolve(__dirname, '..', 'data', 'catalog-backup.csv');

async function main(): Promise<void> {
	const supabase = makeClient(PROD);
	const { data, error } = await supabase.from('books').select('*').order('slug');
	if (error) {
		console.error(`Export failed: ${error.message}`);
		process.exit(1);
	}
	const rows = data ?? [];
	writeFileSync(OUT, serializeBackup(rows), 'utf-8');
	console.log(`Wrote ${rows.length} rows → data/catalog-backup.csv`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
