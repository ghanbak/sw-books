'use server';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getAdmin } from '@/lib/auth';
import { safeWrite } from '@/lib/safe-fs';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { type BookFields, type CatalogOverrides, buildBookFields } from '@app/catalog';
import { type CsvRecord, parseCsv } from '@app/csv/read';
import { CSV_COLUMNS, stringifyCsv } from '@app/csv/write';
import { revalidateTag } from 'next/cache';

type ActionError = { code: string; message: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };

const DATA_DIR = path.resolve(process.cwd(), '../data');

// Fields written back into data/books.csv (their column name == the field name).
const CSV_SCALAR_FIELDS = [
	'title',
	'author',
	'canon',
	'date_published',
	'language',
	'publisher',
	'series_name',
	'series_order',
	'timeline_order',
	'synopsis',
	'type',
	'era',
] as const;
// Fields written back into the manual-override JSONs.
const OVERRIDE_FIELDS = ['cover_image', 'isbn', 'primary_isbn', 'format'] as const;

type DriftField = { field: string; from: string; to: string };
export type DriftRow = { slug: string; title: string; fields: DriftField[] };
export type DriftReport = { changedRows: DriftRow[]; summary: { rows: number; fields: number } };

function loadJson<T>(file: string, fallback: T): T {
	try {
		return JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf-8')) as T;
	} catch {
		return fallback;
	}
}

type LoadedOverrides = {
	current: CatalogOverrides;
	baseline: CatalogOverrides;
	manual: {
		isbn: Record<string, string[]>;
		primaryIsbn: Record<string, string>;
		covers: Record<string, string>;
		formats: Record<string, string[]>;
	};
};

function loadOverrides(): LoadedOverrides {
	const isbnPipeline = loadJson<Record<string, string[]>>('isbn-overrides.json', {});
	const isbnManual = loadJson<Record<string, string[]>>('isbn-manual-overrides.json', {});
	const primaryPipeline = loadJson<Record<string, string>>('primary-isbn.json', {});
	const primaryManual = loadJson<Record<string, string>>('primary-isbn-manual-overrides.json', {});
	const pipelineCovers = loadJson<Record<string, string>>('cover-overrides.json', {});
	const manualCovers = loadJson<Record<string, string>>('cover-manual-overrides.json', {});
	const manualFormats = loadJson<Record<string, string[]>>('format-manual-overrides.json', {});
	const rejectedSlugs = new Set(loadJson<string[]>('csv-isbn-rejected.json', []));

	return {
		current: {
			isbn: { ...isbnPipeline, ...isbnManual },
			primaryIsbn: { ...primaryPipeline, ...primaryManual },
			pipelineCovers,
			manualCovers,
			rejectedSlugs,
			manualFormats,
		},
		// Baseline = what the pipeline + CSV produce with NO manual layer; used to
		// decide which manual-override entries are actually needed.
		baseline: {
			isbn: isbnPipeline,
			primaryIsbn: primaryPipeline,
			pipelineCovers,
			manualCovers: {},
			rejectedSlugs,
			manualFormats: {},
		},
		manual: {
			isbn: isbnManual,
			primaryIsbn: primaryManual,
			covers: manualCovers,
			formats: manualFormats,
		},
	};
}

function eq(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) || Array.isArray(b))
		return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
	return (a ?? null) === (b ?? null);
}

function display(v: unknown): string {
	if (v == null) return '∅';
	if (Array.isArray(v)) return v.join(', ') || '∅';
	return String(v);
}

function toCsvCell(field: string, value: unknown): string {
	if (Array.isArray(value)) return value.join('; ');
	if (value == null) return '';
	return String(value);
}

function readCsvRecords(): CsvRecord[] {
	return parseCsv(readFileSync(path.join(DATA_DIR, 'books.csv'), 'utf-8'));
}

function stableJson(obj: Record<string, unknown>): string {
	const sorted: Record<string, unknown> = {};
	for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
	return `${JSON.stringify(sorted, null, 2)}\n`;
}

export async function getDriftReport(): Promise<Result<DriftReport>> {
	const supabaseAdmin = await getSupabaseAdmin();
	const { data: rows, error } = await supabaseAdmin.from('books').select('*');
	if (error) return { ok: false, error: { code: 'DB', message: error.message } };

	const { current } = loadOverrides();
	const recBySlug = new Map(readCsvRecords().map((r) => [r.slug?.trim() ?? '', r]));

	const changedRows: DriftRow[] = [];
	for (const db of rows ?? []) {
		const rec = recBySlug.get(db.slug);
		if (!rec) {
			changedRows.push({
				slug: db.slug,
				title: db.title,
				fields: [{ field: '(row)', from: 'not in books.csv', to: 'in DB' }],
			});
			continue;
		}
		const expected = buildBookFields(rec, current) as unknown as Record<string, unknown>;
		const dbFields = db as unknown as Record<string, unknown>;
		const fields: DriftField[] = [];
		for (const f of [...CSV_SCALAR_FIELDS, ...OVERRIDE_FIELDS]) {
			if (!eq(dbFields[f], expected[f])) {
				fields.push({ field: f, from: display(expected[f]), to: display(dbFields[f]) });
			}
		}
		if (fields.length) changedRows.push({ slug: db.slug, title: db.title, fields });
	}

	return {
		ok: true,
		data: {
			changedRows,
			summary: {
				rows: changedRows.length,
				fields: changedRows.reduce((n, r) => n + r.fields.length, 0),
			},
		},
	};
}

export async function exportToCsv(): Promise<
	Result<{ csvRowsChanged: number; overrideEntriesChanged: number }>
> {
	if (!(await getAdmin())) return { ok: false, error: { code: 'AUTH', message: 'not authorized' } };
	const supabaseAdmin = await getSupabaseAdmin();
	const { data: rows, error } = await supabaseAdmin.from('books').select('*');
	if (error) return { ok: false, error: { code: 'DB', message: error.message } };

	const { current, baseline, manual } = loadOverrides();
	const records = readCsvRecords();
	const dbBySlug = new Map(
		(rows ?? []).map((r) => [r.slug, r as unknown as Record<string, unknown>]),
	);

	// 1. Scalar columns → books.csv (only changed cells; preserves CSV-only columns).
	let csvRowsChanged = 0;
	for (const rec of records) {
		const slug = rec.slug?.trim() ?? '';
		const db = dbBySlug.get(slug);
		if (!db) continue;
		const expected = buildBookFields(rec, current) as unknown as Record<string, unknown>;
		let touched = false;
		for (const f of CSV_SCALAR_FIELDS) {
			if (!eq(db[f], expected[f])) {
				rec[f] = toCsvCell(f, db[f]);
				touched = true;
			}
		}
		if (touched) csvRowsChanged++;
	}
	await safeWrite(
		'books.csv',
		stringifyCsv(records, CSV_COLUMNS, { bom: true, recordDelimiter: '\r\n' }),
	);

	// 2. Override-backed fields → manual JSONs (entry exists iff DB differs from the
	// pipeline baseline; revert-to-baseline removes the entry).
	const isbn = { ...manual.isbn };
	const primaryIsbn = { ...manual.primaryIsbn };
	const covers = { ...manual.covers };
	const formats = { ...manual.formats };
	const recBySlug = new Map(records.map((r) => [r.slug?.trim() ?? '', r]));
	let overrideEntriesChanged = 0;

	for (const db of rows ?? []) {
		const rec = recBySlug.get(db.slug);
		if (!rec) continue;
		const base = buildBookFields(rec, baseline);

		const reconcile = <T>(
			map: Record<string, T>,
			dbVal: T,
			baseVal: T,
			isEmpty: (v: T) => boolean,
		) => {
			if (!eq(dbVal, baseVal) && !isEmpty(dbVal)) {
				if (!eq(map[db.slug], dbVal)) {
					map[db.slug] = dbVal;
					overrideEntriesChanged++;
				}
			} else if (db.slug in map) {
				delete map[db.slug];
				overrideEntriesChanged++;
			}
		};

		reconcile(isbn, db.isbn ?? [], base.isbn ?? [], (v) => v.length === 0);
		reconcile(primaryIsbn, db.primary_isbn ?? '', base.primary_isbn ?? '', (v) => v === '');
		reconcile(covers, db.cover_image ?? '', base.cover_image ?? '', (v) => v === '');
		reconcile(formats, db.format ?? [], base.format ?? [], (v) => v.length === 0);
	}

	await safeWrite('isbn-manual-overrides.json', stableJson(isbn));
	await safeWrite('primary-isbn-manual-overrides.json', stableJson(primaryIsbn));
	await safeWrite('cover-manual-overrides.json', stableJson(covers));
	await safeWrite('format-manual-overrides.json', stableJson(formats));

	revalidateTag('books');
	return { ok: true, data: { csvRowsChanged, overrideEntriesChanged } };
}
