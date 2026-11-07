/**
 * Pure, offline catalog health checks over parsed `data/catalog-backup.csv`
 * rows (see `lib/csv/backup.ts` parseBackup). No I/O, no Supabase — the
 * `scripts/catalog-health.ts` wrapper owns file reads, network probes and
 * exit codes.
 *
 * Severity:
 *  - error   — breaks the app or a DB write: duplicate slug, one ISBN on two
 *              books (scan can return the wrong book), invalid/malformed ISBN
 *              (normalizeIsbn rejects it, so a scan never matches),
 *              primary_isbn not in isbn[] (merge_books raises), cover URL that
 *              returns 4xx/5xx or a non-image (--head only).
 *  - warning — degraded but not broken: shared cover URL (often a
 *              placeholder, sometimes a legit omnibus), null cover, null
 *              synopsis, tiny cover payload or unreachable cover host
 *              (--head only; network flakes must not fail the loop).
 */
import { isValidIsbn13, isbn10to13 } from './isbn';

export type Severity = 'error' | 'warning';

export type HealthCheck =
	| 'duplicate-slug'
	| 'isbn-collision'
	| 'invalid-isbn'
	| 'primary-not-in-isbns'
	| 'duplicate-cover'
	| 'null-cover'
	| 'null-synopsis'
	| 'cover-http'
	| 'cover-placeholder'
	| 'cover-unreachable';

export type Finding = {
	severity: Severity;
	check: HealthCheck;
	slugs: string[];
	message: string;
};

/** Subset of a `books` row the checks read (matches parseBackup output). */
export type HealthRow = {
	slug: string;
	isbn?: string[] | null;
	primary_isbn?: string | null;
	cover_image?: string | null;
	synopsis?: string | null;
};

/** ISBN-10 mod-11 check (last char may be `X`). */
export function isValidIsbn10(isbn: string): boolean {
	if (!/^\d{9}[\dX]$/.test(isbn)) return false;
	let sum = 0;
	for (let i = 0; i < 10; i++) {
		const c = isbn[i] ?? '0';
		sum += (c === 'X' ? 10 : Number.parseInt(c, 10)) * (10 - i);
	}
	return sum % 11 === 0;
}

export type IsbnVerdict = 'valid-13' | 'valid-10' | 'bad-check-digit' | 'malformed';

/** Classify a stored ISBN string. Stored values are expected bare (no hyphens). */
export function classifyIsbn(raw: string): IsbnVerdict {
	const s = raw.trim().toUpperCase();
	if (/^\d{13}$/.test(s)) return isValidIsbn13(s) ? 'valid-13' : 'bad-check-digit';
	if (/^\d{9}[\dX]$/.test(s)) return isValidIsbn10(s) ? 'valid-10' : 'bad-check-digit';
	return 'malformed';
}

/** Collision key: valid ISBN-10s fold to their ISBN-13 so both forms of one
 *  edition collide; anything else keys on its trimmed raw value. */
function isbnKey(raw: string): string {
	const s = raw.trim().toUpperCase();
	return classifyIsbn(s) === 'valid-10' ? isbn10to13(s) : s;
}

function isBlank(v: string | null | undefined): boolean {
	return v == null || v.trim().length === 0;
}

/** Group values → slugs; return groups shared by 2+ distinct slugs. */
function sharedGroups(pairs: Array<[key: string, slug: string]>): Map<string, string[]> {
	const groups = new Map<string, Set<string>>();
	for (const [key, slug] of pairs) {
		let set = groups.get(key);
		if (!set) {
			set = new Set();
			groups.set(key, set);
		}
		set.add(slug);
	}
	const out = new Map<string, string[]>();
	for (const [key, set] of groups) if (set.size > 1) out.set(key, [...set].sort());
	return out;
}

export function checkDuplicateSlugs(rows: HealthRow[]): Finding[] {
	const counts = new Map<string, number>();
	for (const r of rows) counts.set(r.slug, (counts.get(r.slug) ?? 0) + 1);
	return [...counts]
		.filter(([, n]) => n > 1)
		.map(([slug, n]) => ({
			severity: 'error' as const,
			check: 'duplicate-slug' as const,
			slugs: [slug],
			message: `slug "${slug}" appears on ${n} rows`,
		}));
}

/** Every ISBN a row carries: isbn[] plus primary_isbn (deduped). */
function rowIsbns(r: HealthRow): string[] {
	const all = [...(r.isbn ?? [])];
	if (!isBlank(r.primary_isbn)) all.push(r.primary_isbn as string);
	return [...new Set(all.map((s) => s.trim()).filter((s) => s.length > 0))];
}

export function checkIsbnCollisions(rows: HealthRow[]): Finding[] {
	const pairs: Array<[string, string]> = [];
	for (const r of rows) for (const isbn of rowIsbns(r)) pairs.push([isbnKey(isbn), r.slug]);
	return [...sharedGroups(pairs)].map(([isbn, slugs]) => ({
		severity: 'error',
		check: 'isbn-collision',
		slugs,
		message: `ISBN ${isbn} is on ${slugs.length} books: ${slugs.join(', ')}`,
	}));
}

export function checkInvalidIsbns(rows: HealthRow[]): Finding[] {
	const out: Finding[] = [];
	for (const r of rows) {
		const primary = isBlank(r.primary_isbn) ? null : (r.primary_isbn as string).trim();
		for (const isbn of rowIsbns(r)) {
			const verdict = classifyIsbn(isbn);
			if (verdict === 'valid-13' || verdict === 'valid-10') continue;
			const role = isbn === primary ? 'primary_isbn' : 'isbn[]';
			const what = verdict === 'malformed' ? 'malformed ISBN' : 'invalid check digit';
			out.push({
				severity: 'error',
				check: 'invalid-isbn',
				slugs: [r.slug],
				message: `${r.slug}: ${what} ${isbn} (${role})`,
			});
		}
	}
	return out;
}

/** Mirrors merge_books: exact-string membership of primary_isbn in isbn[]. */
export function checkPrimaryInIsbns(rows: HealthRow[]): Finding[] {
	return rows
		.filter((r) => !isBlank(r.primary_isbn) && !(r.isbn ?? []).includes(r.primary_isbn as string))
		.map((r) => ({
			severity: 'error' as const,
			check: 'primary-not-in-isbns' as const,
			slugs: [r.slug],
			message: `${r.slug}: primary_isbn ${r.primary_isbn} is not in isbn[]`,
		}));
}

export function checkDuplicateCovers(rows: HealthRow[]): Finding[] {
	const pairs: Array<[string, string]> = rows
		.filter((r) => !isBlank(r.cover_image))
		.map((r) => [(r.cover_image as string).trim(), r.slug]);
	return [...sharedGroups(pairs)].map(([url, slugs]) => ({
		severity: 'warning',
		check: 'duplicate-cover',
		slugs,
		message: `cover shared by ${slugs.join(', ')}: ${url}`,
	}));
}

export function checkNullFields(rows: HealthRow[]): Finding[] {
	const out: Finding[] = [];
	for (const r of rows) {
		if (isBlank(r.cover_image)) {
			out.push({
				severity: 'warning',
				check: 'null-cover',
				slugs: [r.slug],
				message: `${r.slug}: no cover_image`,
			});
		}
		if (isBlank(r.synopsis)) {
			out.push({
				severity: 'warning',
				check: 'null-synopsis',
				slugs: [r.slug],
				message: `${r.slug}: no synopsis`,
			});
		}
	}
	return out;
}

/** All offline checks, in report order. */
export function runOfflineChecks(rows: HealthRow[]): Finding[] {
	return [
		...checkDuplicateSlugs(rows),
		...checkIsbnCollisions(rows),
		...checkInvalidIsbns(rows),
		...checkPrimaryInIsbns(rows),
		...checkDuplicateCovers(rows),
		...checkNullFields(rows),
	];
}

/** Below this a 200 image is almost certainly a placeholder (Open Library's
 *  missing-cover response is a 43-byte GIF). Matches detect-placeholder-covers. */
export const PLACEHOLDER_MAX_BYTES = 2048;

export type CoverProbe =
	| { kind: 'response'; status: number; contentType: string | null; contentLength: number | null }
	| { kind: 'network-error'; detail: string };

/** Map one cover probe to a finding, or null when the cover looks healthy. */
export function classifyCoverProbe(slug: string, url: string, probe: CoverProbe): Finding | null {
	if (probe.kind === 'network-error') {
		return {
			severity: 'warning',
			check: 'cover-unreachable',
			slugs: [slug],
			message: `${slug}: cover unreachable (${probe.detail}): ${url}`,
		};
	}
	const { status, contentType, contentLength } = probe;
	if (status < 200 || status >= 300) {
		return {
			severity: 'error',
			check: 'cover-http',
			slugs: [slug],
			message: `${slug}: cover HTTP ${status}: ${url}`,
		};
	}
	if (!contentType || !/^image\//i.test(contentType)) {
		return {
			severity: 'error',
			check: 'cover-http',
			slugs: [slug],
			message: `${slug}: cover is not an image (${contentType ?? 'no content-type'}): ${url}`,
		};
	}
	if (contentLength != null && contentLength < PLACEHOLDER_MAX_BYTES) {
		return {
			severity: 'warning',
			check: 'cover-placeholder',
			slugs: [slug],
			message: `${slug}: cover is ${contentLength} bytes (likely placeholder): ${url}`,
		};
	}
	return null;
}

export type HealthSummary = { errors: number; warnings: number; byCheck: Record<string, number> };

export function summarize(findings: Finding[]): HealthSummary {
	const byCheck: Record<string, number> = {};
	let errors = 0;
	let warnings = 0;
	for (const f of findings) {
		byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
		if (f.severity === 'error') errors++;
		else warnings++;
	}
	return { errors, warnings, byCheck };
}
