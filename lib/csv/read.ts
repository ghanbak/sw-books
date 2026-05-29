/**
 * CSV reading for the catalog. Parses to opaque string records keyed by header
 * so every column round-trips losslessly — array splitting and type coercion
 * are the caller's concern.
 */
import { parse } from 'csv-parse/sync';

export type CsvRecord = Record<string, string>;

/**
 * Parse CSV text into header-keyed string records. Strips a leading UTF-8 BOM
 * and tolerates both `\n` and `\r\n` line endings. Every cell stays a string
 * (empty cells become `''`).
 */
export function parseCsv(text: string): CsvRecord[] {
	return parse(text, {
		columns: true,
		bom: true,
		// data/books.csv mixes \r\n (most rows) with bare \n (last rows); accept
		// both so trailing rows aren't absorbed into the prior record.
		record_delimiter: ['\r\n', '\n'],
		skip_empty_lines: true,
		relax_column_count: true,
		cast: false,
		trim: false,
	}) as CsvRecord[];
}
