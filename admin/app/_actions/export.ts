'use server';

import { IS_HOSTED } from '@/lib/admin-allowlist';
import { getAdmin } from '@/lib/auth';
import { DataDirUnavailableError, safeRead, safeWrite } from '@/lib/safe-fs';
import { getDbTarget, getSupabaseAdmin } from '@/lib/supabase-admin';
import { dbError } from '@app/action-errors';
import { serializeBackup } from '@app/csv/backup';
import { type DriftReport, diffAgainstBackup } from '@app/csv/drift';
import { parseCsv } from '@app/csv/read';
import { revalidateTag } from 'next/cache';

export type { DriftReport, DriftRow } from '@app/csv/drift';

type ActionError = { code: string; message: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

/** The committed prod mirror written by `npm run catalog:backup` and read by
 *  `npm run catalog:restore`. Drift and Export both use it as the baseline. */
const BACKUP_FILE = 'catalog-backup.csv';

/** The active DB vs data/catalog-backup.csv. */
export async function getDriftReport(): Promise<Result<DriftReport>> {
	if (!(await getAdmin())) return { ok: false, error: { code: 'AUTH', message: 'not authorized' } };
	let text: string | null;
	try {
		text = await safeRead(BACKUP_FILE);
	} catch (err) {
		// Hosted deploys have no data/ — drift is N/A there, not an error.
		if (err instanceof DataDirUnavailableError) {
			return { ok: true, data: { changedRows: [], summary: { rows: 0, fields: 0 } } };
		}
		return backupReadError(err);
	}
	if (text === null) {
		return {
			ok: false,
			error: { code: 'NO_BACKUP', message: `data/${BACKUP_FILE} is missing.` },
		};
	}
	let backup: ReturnType<typeof parseCsv>;
	try {
		backup = parseCsv(text);
	} catch (err) {
		return backupReadError(err);
	}

	const supabaseAdmin = await getSupabaseAdmin();
	const { data: rows, error } = await supabaseAdmin.from('books').select('*');
	if (error) return { ok: false, error: dbError('getDriftReport', error) };

	return { ok: true, data: diffAgainstBackup(rows ?? [], backup) };
}

/** A read or parse failure degrades the drift check instead of rejecting the page. */
function backupReadError(err: unknown): { ok: false; error: ActionError } {
	// The raw error can carry absolute paths; it stays in the server log.
	console.error('[admin:getDriftReport]', err);
	return {
		ok: false,
		error: { code: 'BACKUP_READ', message: `could not read data/${BACKUP_FILE} (see server log)` },
	};
}

/**
 * Rewrite data/catalog-backup.csv from the production DB — the same bytes
 * `npm run catalog:export:prod` writes (commit it yourself, or use
 * `npm run catalog:backup`). Prod target only: the backup mirrors production,
 * so exporting the local DB over it would commit local-only state.
 */
export async function exportToCsv(): Promise<Result<{ rows: number }>> {
	if (!(await getAdmin())) return { ok: false, error: { code: 'AUTH', message: 'not authorized' } };
	if (IS_HOSTED) {
		return {
			ok: false,
			error: { code: 'READ_ONLY', message: 'Export to CSV runs in the local admin only.' },
		};
	}
	if ((await getDbTarget()) !== 'prod') {
		return {
			ok: false,
			error: {
				code: 'TARGET',
				message: 'The backup mirrors production. Switch the database to Prod before exporting.',
			},
		};
	}
	const supabaseAdmin = await getSupabaseAdmin();
	const { data: rows, error } = await supabaseAdmin.from('books').select('*');
	if (error) return { ok: false, error: dbError('exportToCsv', error) };
	if (!rows?.length) {
		// Same guard as scripts/export-db-to-csv.ts: never overwrite with nothing.
		return {
			ok: false,
			error: {
				code: 'EMPTY',
				message: 'The database returned 0 rows; the backup was not written.',
			},
		};
	}

	try {
		await safeWrite(BACKUP_FILE, serializeBackup(rows));
	} catch (err) {
		// The raw error can carry absolute paths; it stays in the server log.
		console.error('[admin:exportToCsv]', err);
		return {
			ok: false,
			error: {
				code: 'BACKUP_WRITE',
				message: `could not write data/${BACKUP_FILE} (see server log)`,
			},
		};
	}
	revalidateTag('books');
	return { ok: true, data: { rows: rows.length } };
}
