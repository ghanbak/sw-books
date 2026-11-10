import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Database } from '../../types';
import { buildBackupRecord, parseBackup, serializeBackup } from '../backup';
import { diffAgainstBackup } from '../drift';
import { parseCsv } from '../read';

type BookRow = Database['public']['Tables']['books']['Row'];

const here = dirname(fileURLToPath(import.meta.url));
const BACKUP_CSV = resolve(here, '../../../data/catalog-backup.csv');

function row(overrides: Partial<BookRow>): BookRow {
	return {
		id: '00000000-0000-0000-0000-000000000001',
		slug: 'x',
		title: 'X',
		author: ['Author One'],
		canon: 'Canon',
		cover_image: null,
		created_at: '2026-01-01T00:00:00+00:00',
		date_published: null,
		era: null,
		format: null,
		isbn: null,
		language: null,
		primary_isbn: null,
		publisher: null,
		series_name: null,
		series_order: null,
		synopsis: null,
		timeline_order: null,
		type: 'Adult Novel',
		updated_at: '2026-02-02T00:00:00+00:00',
		...overrides,
	};
}

describe('diffAgainstBackup', () => {
	it('reports no drift for a DB restored from the committed backup', () => {
		const text = readFileSync(BACKUP_CSV, 'utf-8');
		// What `npm run catalog:restore` writes, read back as rows.
		const restored = parseBackup(text).map((ins) => row(ins as Partial<BookRow>));
		const report = diffAgainstBackup(restored, parseCsv(text));
		expect(report.summary).toEqual({ rows: 0, fields: 0 });
		expect(restored.length).toBeGreaterThan(185);
	});

	it('ignores id and created_at (seeded rows get their own)', () => {
		const backup = [buildBackupRecord(row({ slug: 'a' }))];
		const db = [row({ slug: 'a', id: 'other-uuid', created_at: '2027-01-01T00:00:00+00:00' })];
		expect(diffAgainstBackup(db, backup).summary.rows).toBe(0);
	});

	it('lists changed fields with backup → DB values', () => {
		const backup = parseCsv(serializeBackup([row({ slug: 'a', isbn: ['1', '2'], era: 'Old' })]));
		const db = [row({ slug: 'a', isbn: ['1'], era: 'New', title: 'X2' })];
		const report = diffAgainstBackup(db, backup);
		expect(report.changedRows).toEqual([
			{
				slug: 'a',
				title: 'X2',
				fields: [
					{ field: 'title', from: 'X', to: 'X2' },
					{ field: 'era', from: 'Old', to: 'New' },
					{ field: 'isbn', from: '1, 2', to: '1' },
				],
			},
		]);
		expect(report.summary).toEqual({ rows: 1, fields: 3 });
	});

	it('reports rows only in the DB and rows only in the backup', () => {
		const backup = [buildBackupRecord(row({ slug: 'gone', title: 'Gone' }))];
		const db = [row({ slug: 'added', title: 'Added' })];
		const report = diffAgainstBackup(db, backup);
		expect(report.changedRows.map((r) => [r.slug, r.fields[0]])).toEqual([
			['added', { field: '(row)', from: 'not in backup', to: 'in DB' }],
			['gone', { field: '(row)', from: 'in backup', to: 'not in DB' }],
		]);
	});

	it('treats null and empty values as equal', () => {
		const backup = [buildBackupRecord(row({ slug: 'a', isbn: null, synopsis: null }))];
		const db = [row({ slug: 'a', isbn: [], synopsis: '' })];
		expect(diffAgainstBackup(db, backup).summary.rows).toBe(0);
	});
});
