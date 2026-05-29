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

export type StringifyOptions = {
	/** Prepend a UTF-8 BOM (data/books.csv carries one). Default false. */
	bom?: boolean;
	/** Row terminator. Default '\n'; pass '\r\n' to match data/books.csv. */
	recordDelimiter?: '\n' | '\r\n';
};

function ensureTrailingNewline(out: string, eol: string): string {
	return out.endsWith(eol) ? out : `${out}${eol}`;
}

/**
 * Stringify opaque string records (e.g. from parseCsv) back to CSV. The inverse
 * of parseCsv. Defaults emit no BOM and `\n`; pass options to round-trip the
 * on-disk data/books.csv (BOM + `\r\n`) so an export touches only changed cells.
 */
export function stringifyCsv(
	records: CsvRecord[],
	columns: readonly string[] = CSV_COLUMNS,
	options: StringifyOptions = {},
): string {
	const eol = options.recordDelimiter ?? '\n';
	const out = stringify(records, {
		columns: columns as string[],
		header: true,
		bom: options.bom ?? false,
		quoted_match: QUOTE_WHEN,
		record_delimiter: eol,
	});
	return ensureTrailingNewline(out, eol);
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
	return ensureTrailingNewline(out, '\n');
}
