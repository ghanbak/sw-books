/**
 * CSV writing for the catalog. Emits with stable, explicit knobs so output is
 * deterministic and diff-friendly:
 *  - fixed column order (`CSV_COLUMNS`)
 *  - quote only when a cell contains `"`, `,` or a newline (matches the
 *    hand-authored data/books.csv; semicolon-joined cells stay unquoted)
 *  - `\n` record delimiter, no BOM
 */
import { stringify } from 'csv-stringify/sync';
import type { Database } from '../types';
import type { CsvRecord } from './read';

type BookRow = Database['public']['Tables']['books']['Row'];

/** Column order of data/books.csv, matched exactly. */
export const CSV_COLUMNS = [
	'title',
	'id',
	'slug',
	'author',
	'cover_image',
	'canon',
	'characters',
	'date_published',
	'format',
	'isbn',
	'language',
	'publisher',
	'series',
	'series_name',
	'series_order',
	'timeline_order',
	'synopsis',
	'type',
	'asin',
	'era',
	'amazon_affiliate_link',
] as const;

const QUOTE_WHEN = /[",\n]/;

function ensureTrailingNewline(out: string): string {
	return out.endsWith('\n') ? out : `${out}\n`;
}

/**
 * Stringify opaque string records (e.g. from parseCsv) back to CSV. The inverse
 * of parseCsv modulo BOM and line-ending normalization.
 */
export function stringifyCsv(
	records: CsvRecord[],
	columns: readonly string[] = CSV_COLUMNS,
): string {
	const out = stringify(records, {
		columns: columns as string[],
		header: true,
		bom: false,
		quoted_match: QUOTE_WHEN,
		record_delimiter: '\n',
	});
	return ensureTrailingNewline(out);
}

/**
 * Stringify catalog rows for export. Array cells (author/isbn/format) join on
 * `;`; Date cells render as `YYYY-MM-DD`; null/undefined become empty.
 */
export function stringifyBooksCsv(rows: BookRow[]): string {
	const out = stringify(rows, {
		columns: CSV_COLUMNS as unknown as string[],
		header: true,
		bom: false,
		quoted_match: QUOTE_WHEN,
		record_delimiter: '\n',
		cast: {
			object: (value) => {
				if (Array.isArray(value)) return value.join(';');
				throw new Error('non-array object cell — coerce upstream');
			},
			date: (value) => value.toISOString().slice(0, 10),
		},
	});
	return ensureTrailingNewline(out);
}
