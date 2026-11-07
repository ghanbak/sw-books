/**
 * Guard for scripts/seed.ts — the frozen `data/books.csv` seed.
 *
 * The production DB is the catalog source of truth (see lib/csv/backup.ts):
 * changesets write prod directly and never touch books.csv, so seeding prod
 * from the CSV would roll curated rows back. The seed is local-only; prod
 * recovery goes through `npm run catalog:restore` (data/catalog-backup.csv).
 *
 * Pure so the decision is unit-testable. Returns a refusal message, or null
 * when the seed may proceed.
 */

export const PROD_SEED_REFUSAL =
	'Refusing to seed production from data/books.csv.\n' +
	'The production DB is the catalog source of truth; books.csv + the override JSONs are frozen\n' +
	'and would overwrite curated rows (dates, formats, ISBNs, covers, synopses).\n' +
	'To roll prod back to the last committed backup (data/catalog-backup.csv), run:\n' +
	'  npm run catalog:restore -- --production\n' +
	'Local dev only: npm run db:seed (or catalog:restore without --production).';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function isLocalUrl(url: string): boolean {
	try {
		return LOCAL_HOSTS.has(new URL(url).hostname);
	} catch {
		return false;
	}
}

export function seedRefusal(argv: readonly string[], url?: string): string | null {
	if (argv.includes('--production')) return PROD_SEED_REFUSAL;
	if (url !== undefined && !isLocalUrl(url)) {
		return `Refusing to seed non-local database ${url} from data/books.csv.\n${PROD_SEED_REFUSAL}`;
	}
	return null;
}
