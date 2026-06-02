/**
 * Deterministic DB → CSV backup for the catalog.
 *
 * Once the production database is the source of truth, `data/catalog-backup.csv`
 * is a one-directional, git-committed mirror used for rollback and for seeding
 * empty dev DBs. It is NOT the editing surface (the legacy `data/books.csv` +
 * override JSONs stay frozen).
 *
 * Design constraints:
 *  - Columns mirror the live `books` schema (no legacy CSV-only columns:
 *    `characters`/`series`/`asin`/`amazon_affiliate_link` are gone; the uuid
 *    `id` is kept so a restore preserves identity and `user_books` FKs).
 *  - Arrays join on `;` ONLY (never `,`), so a comma-bearing author survives the
 *    round-trip: the cell gets quoted by the CSV writer, and the restore parser
 *    splits on `;` alone. (Contrast `lib/catalog.ts` splitMultiValue, which is
 *    `;`/`,`-tolerant and would corrupt such a value — that path stays on the
 *    frozen seed only.)
 *  - Output is deterministic for a fixed DB state: rows ordered by `slug`, fixed
 *    column order, array element order preserved (Postgres keeps array order, so
 *    no sorting is needed — and sorting `author` would corrupt author order).
 */
import type { Database } from '../types';
import { type CsvRecord, parseCsv } from './read';
import { stringifyCsv } from './write';

type BookRow = Database['public']['Tables']['books']['Row'];
type BookInsert = Database['public']['Tables']['books']['Insert'];

/** Backup column order. Mirrors the `books` schema; `updated_at` is omitted
 *  (trigger-managed; pure diff noise and not honored on restore). */
export const BACKUP_COLUMNS = [
	'id',
	'slug',
	'title',
	'author',
	'canon',
	'type',
	'era',
	'series_name',
	'series_order',
	'timeline_order',
	'date_published',
	'publisher',
	'language',
	'isbn',
	'primary_isbn',
	'format',
	'cover_image',
	'synopsis',
	'created_at',
] as const;

const ARRAY_DELIM = ';';

function joinArray(value: string[] | null): string {
	return value ? value.join(ARRAY_DELIM) : '';
}

/** Split a backup array cell on `;` only. Empty → []. */
function splitArray(cell: string): string[] {
	return cell ? cell.split(ARRAY_DELIM).filter((s) => s.length > 0) : [];
}

/** One `books` row → opaque string record (every cell a string). */
export function buildBackupRecord(row: BookRow): CsvRecord {
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		author: joinArray(row.author),
		canon: row.canon,
		type: row.type,
		era: row.era ?? '',
		series_name: row.series_name ?? '',
		series_order: row.series_order == null ? '' : String(row.series_order),
		timeline_order: row.timeline_order == null ? '' : String(row.timeline_order),
		date_published: row.date_published ?? '',
		publisher: row.publisher ?? '',
		language: row.language ?? '',
		isbn: joinArray(row.isbn),
		primary_isbn: row.primary_isbn ?? '',
		format: joinArray(row.format),
		cover_image: row.cover_image ?? '',
		synopsis: row.synopsis ?? '',
		created_at: row.created_at ?? '',
	};
}

/**
 * Serialize `books` rows to the deterministic backup CSV. Rows are sorted by
 * slug so the output is byte-stable for a fixed DB state.
 */
export function serializeBackup(rows: BookRow[]): string {
	const records = [...rows]
		.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
		.map(buildBackupRecord);
	return stringifyCsv(records, BACKUP_COLUMNS, { recordDelimiter: '\n' });
}

/** One backup record → `books` insert payload (arrays split on `;`, '' → null). */
export function backupRecordToInsert(rec: CsvRecord): BookInsert {
	const orNull = (s: string): string | null => (s.length > 0 ? s : null);
	const arrOrNull = (s: string): string[] | null => {
		const a = splitArray(s);
		return a.length > 0 ? a : null;
	};
	return {
		id: rec.id || undefined,
		slug: rec.slug,
		title: rec.title,
		author: splitArray(rec.author),
		canon: rec.canon,
		type: rec.type,
		era: orNull(rec.era),
		series_name: orNull(rec.series_name),
		series_order: rec.series_order ? Number.parseInt(rec.series_order, 10) : null,
		timeline_order: rec.timeline_order ? Number.parseFloat(rec.timeline_order) : null,
		date_published: orNull(rec.date_published),
		publisher: orNull(rec.publisher),
		language: orNull(rec.language),
		isbn: arrOrNull(rec.isbn),
		primary_isbn: orNull(rec.primary_isbn),
		format: arrOrNull(rec.format),
		cover_image: orNull(rec.cover_image),
		synopsis: orNull(rec.synopsis),
		created_at: orNull(rec.created_at),
	};
}

/** Parse a backup CSV into insert payloads (inverse of serializeBackup). */
export function parseBackup(text: string): BookInsert[] {
	return parseCsv(text).map(backupRecordToInsert);
}
