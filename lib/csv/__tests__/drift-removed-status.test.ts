import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Database } from '../../types';
import { buildBackupRecord, serializeBackup } from '../backup';
import { diffAgainstBackup } from '../drift';
import { parseCsv } from '../read';

// #458: /admin/diff linked rows deleted from the DB to /admin/books/<slug>,
// which 404s. Each drift row now carries a status so the page can drop the link.

type BookRow = Database['public']['Tables']['books']['Row'];

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

describe('diffAgainstBackup row status (#458)', () => {
	const backup = parseCsv(
		serializeBackup([
			row({ slug: 'gone', title: 'Gone' }),
			row({ slug: 'kept', title: 'Kept', era: 'Old' }),
		]),
	);
	const db = [
		row({ slug: 'added', title: 'Added' }),
		row({ slug: 'kept', title: 'Kept', era: 'New' }),
	];
	const bySlug = new Map(diffAgainstBackup(db, backup).changedRows.map((r) => [r.slug, r]));

	it('marks a backup slug absent from the DB as removed', () => {
		expect(bySlug.get('gone')?.status).toBe('removed');
		expect(bySlug.get('gone')?.title).toBe('Gone');
	});

	it('marks a DB slug absent from the backup as added', () => {
		expect(bySlug.get('added')?.status).toBe('added');
	});

	it('marks a row present in both with field drift as changed', () => {
		expect(bySlug.get('kept')?.status).toBe('changed');
	});

	it('marks a removed row even when it is the only drift', () => {
		const only = diffAgainstBackup([], [buildBackupRecord(row({ slug: 'solo' }))]);
		expect(only.changedRows.map((r) => [r.slug, r.status])).toEqual([['solo', 'removed']]);
	});
});

describe('/admin/diff gates the book link on status (#458)', () => {
	const src = readFileSync(resolve(__dirname, '../../../admin/app/admin/diff/page.tsx'), 'utf8');

	it("renders removed rows' titles without a link", () => {
		// `row.status === 'removed' ? <plain title> : <Link href=/admin/books/...>`
		const gate =
			/row\.status\s*===\s*'removed'\s*\?[\s\S]{0,400}?:\s*\(?\s*<Link\s+href=\{`\/admin\/books\/\$\{row\.slug\}`\}/;
		expect(src).toMatch(gate);
	});

	it('shows a removed marker for those rows', () => {
		const branch =
			/row\.status\s*===\s*'removed'\s*\?([\s\S]{0,400}?):\s*\(?\s*<Link/.exec(src)?.[1] ?? '';
		expect(branch).toMatch(/\{row\.title\}/);
		expect(branch).toMatch(/>\s*removed\s*</i);
	});
});
