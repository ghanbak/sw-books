/**
 * Drift between a database's `books` rows and the committed backup
 * (`data/catalog-backup.csv`). Powers the admin's /diff page and drift chip.
 *
 * Compared in backup-cell space: each DB row goes through `buildBackupRecord`,
 * the same function that wrote the backup, so a DB restored from the backup
 * (`npm run catalog:restore`) diffs to zero with no number/array coercion noise.
 * `id` and `created_at` are identity/metadata, not catalog content, and are
 * skipped (a `db:seed`ed row has its own uuid and timestamp).
 */
import type { Database } from '../types';
import { BACKUP_COLUMNS, buildBackupRecord } from './backup';
import type { CsvRecord } from './read';

type BookRow = Database['public']['Tables']['books']['Row'];

export type DriftField = { field: string; from: string; to: string };
export type DriftRow = { slug: string; title: string; fields: DriftField[] };
export type DriftReport = { changedRows: DriftRow[]; summary: { rows: number; fields: number } };

const SKIPPED = new Set<string>(['id', 'slug', 'created_at']);
export const DRIFT_FIELDS = BACKUP_COLUMNS.filter((c) => !SKIPPED.has(c));
const ARRAY_FIELDS = new Set<string>(['author', 'isbn', 'format']);

function display(field: string, cell: string): string {
	if (!cell) return '∅';
	return ARRAY_FIELDS.has(field) ? cell.split(';').join(', ') : cell;
}

/**
 * `from` is the backup value, `to` the DB value. Rows only in the DB or only in
 * the backup are reported as a single `(row)` field. Output is ordered by slug.
 */
export function diffAgainstBackup(dbRows: BookRow[], backup: CsvRecord[]): DriftReport {
	const backupBySlug = new Map(backup.map((r) => [r.slug ?? '', r]));
	const dbSlugs = new Set<string>();
	const changedRows: DriftRow[] = [];

	for (const db of dbRows) {
		dbSlugs.add(db.slug);
		const saved = backupBySlug.get(db.slug);
		if (!saved) {
			changedRows.push({
				slug: db.slug,
				title: db.title,
				fields: [{ field: '(row)', from: 'not in backup', to: 'in DB' }],
			});
			continue;
		}
		const current = buildBackupRecord(db);
		const fields: DriftField[] = [];
		for (const f of DRIFT_FIELDS) {
			const was = saved[f] ?? '';
			const now = current[f] ?? '';
			if (now !== was) {
				fields.push({ field: f, from: display(f, was), to: display(f, now) });
			}
		}
		if (fields.length) changedRows.push({ slug: db.slug, title: db.title, fields });
	}

	for (const saved of backup) {
		if (dbSlugs.has(saved.slug ?? '')) continue;
		changedRows.push({
			slug: saved.slug ?? '',
			title: saved.title ?? '',
			fields: [{ field: '(row)', from: 'in backup', to: 'not in DB' }],
		});
	}

	changedRows.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
	return {
		changedRows,
		summary: {
			rows: changedRows.length,
			fields: changedRows.reduce((n, r) => n + r.fields.length, 0),
		},
	};
}
