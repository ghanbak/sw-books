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

const PIPELINE_HOSTS = [
	'covers.openlibrary.org',
	'books.google.com',
	'books.googleusercontent.com',
];

const MONTHS = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december',
];

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Y/M/D → `YYYY-MM-DD`, or null when the day doesn't exist (e.g. Feb 30). */
function isoDate(year: number, month: number, day: number): string | null {
	const d = new Date(Date.UTC(year, month - 1, day));
	if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
		return null;
	}
	return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/**
 * Normalize a release date to `YYYY-MM-DD` without any timezone conversion.
 * Explicitly parses the shapes the CSV and wiki use — "January 5, 2021",
 * "May 2006" (padded to the 1st), "2006", "2021-01-05", "2021-01". Anything else falls
 * back to the JS parser, read back via local components so the host TZ can't
 * shift the day.
 */
export function parseDate(dateStr: string): string | null {
	const s = dateStr.trim();
	if (!s) return null;

	let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));

	// Google Books month precision. Not left to the fallback: `new Date('2015-05')`
	// is UTC midnight, so its local components land on Apr 30 in UTC- zones.
	m = /^(\d{4})-(\d{2})$/.exec(s);
	if (m) return isoDate(Number(m[1]), Number(m[2]), 1);

	m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
	if (m) {
		const month = monthIndex(m[1] ?? '');
		if (month) return isoDate(Number(m[3]), month, Number(m[2]));
	}

	m = /^([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(s);
	if (m) {
		const month = monthIndex(m[1] ?? '');
		if (month) return isoDate(Number(m[2]), month, 1);
	}

	m = /^(\d{4})$/.exec(s);
	if (m) return isoDate(Number(m[1]), 1, 1);

	const d = new Date(s);
	if (Number.isNaN(d.getTime())) return null;
	return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** 1-based month for a full or 3+ letter abbreviated English month name. */
function monthIndex(name: string): number | null {
	const n = name.toLowerCase();
	if (n.length < 3) return null;
	const i = MONTHS.findIndex((full) => full.startsWith(n));
	return i === -1 ? null : i + 1;
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
