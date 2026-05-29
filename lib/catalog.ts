/**
 * The canonical CSV → catalog-row transform: the single source of truth for how
 * data/books.csv + the override JSONs map onto a `books` row. Used by the seed
 * script and the admin export (drift detection + write-back) so the two never
 * diverge.
 */
import type { CsvRecord } from './csv/read';
import type { Database } from './types';

type BookRow = Database['public']['Tables']['books']['Row'];

/** A book row minus DB-managed columns. */
export type BookFields = Omit<BookRow, 'id' | 'created_at' | 'updated_at'>;

export type CatalogOverrides = {
	/** Merged pipeline + manual isbn[] overrides (manual wins). */
	isbn: Record<string, string[]>;
	/** Merged pipeline + manual primary_isbn overrides (manual wins). */
	primaryIsbn: Record<string, string>;
	pipelineCovers: Record<string, string>;
	manualCovers: Record<string, string>;
	/** Slugs whose CSV ISBN OL filed under a different book — distrust the CSV cover. */
	rejectedSlugs: ReadonlySet<string>;
	manualFormats: Record<string, string[]>;
};

const PIPELINE_HOSTS = ['covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com'];

export function parseDate(dateStr: string): string | null {
	if (!dateStr) return null;
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return null;
	return d.toISOString().split('T')[0] ?? null;
}

export function splitMultiValue(val: string): string[] {
	if (!val) return [];
	return val
		.split(/[;,]/)
		.map((s) => s.trim())
		.filter(Boolean)
		.filter((v, i, a) => a.indexOf(v) === i);
}

export function isPipelineHostedCover(url: string | null | undefined): boolean {
	if (!url) return true;
	return PIPELINE_HOSTS.some((host) => url.includes(host));
}

export function pickCoverImage(
	manualUrl: string | undefined,
	csvUrl: string | null,
	pipelineUrl: string | undefined,
): string | null {
	if (manualUrl) return manualUrl;
	if (csvUrl && !isPipelineHostedCover(csvUrl)) return csvUrl;
	return pipelineUrl ?? null;
}

const cell = (value: string | undefined) => (value ?? '').trim();

/** Resolve the isbn[] for a slug: override list, else the single CSV ISBN. */
export function resolveIsbnList(rec: CsvRecord, isbnOverrides: Record<string, string[]>): string[] {
	const slug = cell(rec.slug);
	const csvIsbn = cell(rec.isbn);
	return isbnOverrides[slug] ?? (csvIsbn ? [csvIsbn] : []);
}

/** Build the catalog row fields seed upserts for one CSV record. */
export function buildBookFields(rec: CsvRecord, o: CatalogOverrides): BookFields {
	const slug = cell(rec.slug);
	const isbnList = resolveIsbnList(rec, o.isbn);
	const csvCover = cell(rec.cover_image) || null;
	const trustedCsvCover = o.rejectedSlugs.has(slug) ? null : csvCover;
	const seriesOrder = cell(rec.series_order);
	const timelineOrder = cell(rec.timeline_order);

	return {
		title: cell(rec.title),
		slug,
		author: splitMultiValue(cell(rec.author).replace(/;/g, ';')),
		cover_image: pickCoverImage(o.manualCovers[slug], trustedCsvCover, o.pipelineCovers[slug]),
		canon: cell(rec.canon),
		date_published: parseDate(cell(rec.date_published)),
		format: o.manualFormats[slug] ?? splitMultiValue(cell(rec.format)),
		isbn: isbnList,
		primary_isbn: o.primaryIsbn[slug] ?? isbnList[0] ?? null,
		language: cell(rec.language) || 'English',
		publisher: cell(rec.publisher) || null,
		series_name: cell(rec.series_name) || null,
		series_order: seriesOrder ? Number.parseInt(seriesOrder, 10) : null,
		timeline_order: timelineOrder ? Number.parseFloat(timelineOrder) : null,
		synopsis: cell(rec.synopsis) || null,
		type: cell(rec.type),
		era: cell(rec.era) || null,
	};
}
