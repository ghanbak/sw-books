import { z } from 'zod';
import type { Database } from './types';

/**
 * Server-side validation for admin catalog writes (`patchBook` / `createBook`
 * via the `@app/book-schema` alias), plus the pure helpers the book page's
 * manual-edit form uses to build a patch. Lives in root `lib/` so Vitest can
 * cover it (the admin package has no test runner).
 */

type BookRow = Database['public']['Tables']['books']['Row'];

/** Mirror the `books.canon` / `books.type` CHECK constraints. */
export const CANON_VALUES = ['Canon', 'Legends'] as const;
export const TYPE_VALUES = ['Adult Novel', 'YA Novel', 'Middle Grade Novel'] as const;

const DATE = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
	.nullable();

/** http(s) only; `z.url` alone also accepts javascript:, data:, ftp: … */
const COVER_URL = z.url({ protocol: /^https?$/, error: 'expected an http(s) URL' }).nullable();

/** Shared field rules — patch and create derive from these so they never drift. */
export const bookFields = {
	title: z.string().min(1),
	author: z.array(z.string().trim().min(1, 'author names cannot be empty')),
	cover_image: COVER_URL,
	publisher: z.string().nullable(),
	date_published: DATE,
	language: z.string().nullable(),
	format: z.array(z.string()),
	synopsis: z.string().nullable(),
	isbn: z.array(z.string()),
	primary_isbn: z.string().nullable(),
	canon: z.enum(CANON_VALUES),
	type: z.enum(TYPE_VALUES),
	era: z.string().nullable(),
	series_name: z.string().nullable(),
	series_order: z.number().int().nullable(),
	timeline_order: z.number().nullable(),
};

export const patchSchema = z
	.object(bookFields)
	.partial()
	// Lenient: a patch may omit isbn while setting primary_isbn (partial update).
	.refine((p) => !p.isbn || !p.primary_isbn || p.isbn.includes(p.primary_isbn), {
		message: 'primary_isbn must be one of isbn[]',
		path: ['primary_isbn'],
	});

export type BookPatchInput = z.input<typeof patchSchema>;

/**
 * Create schema: title/slug/canon/type required; arrays default to [] (DB
 * NOT NULL); nullable scalars default to null. The primary_isbn refine is
 * STRICT here (unlike patch): a non-null primary_isbn must be a member of a
 * populated isbn[].
 */
export const createSchema = z
	.object({
		...bookFields,
		slug: z
			.string()
			.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case (a-z, 0-9, hyphens)'),
		author: bookFields.author.default([]),
		isbn: z.array(z.string()).default([]),
		format: z.array(z.string()).default([]),
		cover_image: COVER_URL.default(null),
		publisher: z.string().nullable().default(null),
		date_published: DATE.default(null),
		language: z.string().nullable().default(null),
		synopsis: z.string().nullable().default(null),
		primary_isbn: z.string().nullable().default(null),
		era: z.string().nullable().default(null),
		series_name: z.string().nullable().default(null),
		series_order: z.number().int().nullable().default(null),
		timeline_order: z.number().nullable().default(null),
	})
	.refine((d) => d.primary_isbn == null || d.isbn.includes(d.primary_isbn), {
		message: 'primary_isbn must be one of isbn[]',
		path: ['primary_isbn'],
	});

export type BookCreateInput = z.input<typeof createSchema>;

/** First issue as `field: message`, so the admin can tell which field failed. */
export function firstIssueMessage(error: z.ZodError, fallback: string): string {
	const issue = error.issues[0];
	if (!issue) return fallback;
	const field = issue.path.map(String).join('.');
	return field ? `${field}: ${issue.message}` : issue.message;
}

/** Every issue keyed by its top-level field (first message wins). */
export function issuesByField(error: z.ZodError): Partial<Record<string, string>> {
	const out: Partial<Record<string, string>> = {};
	for (const issue of error.issues) {
		const key = String(issue.path[0] ?? '');
		if (!(key in out)) out[key] = issue.message;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Manual edit form (book page)

/** Columns hand-editable on `/admin/books/[slug]`. */
export const MANUAL_FIELDS = [
	'title',
	'author',
	'cover_image',
	'synopsis',
	'publisher',
	'date_published',
	'era',
	'series_name',
	'series_order',
	'timeline_order',
	'canon',
	'type',
] as const;
export type ManualField = (typeof MANUAL_FIELDS)[number];

export type ManualBook = Pick<BookRow, ManualField>;
/** Raw input values; author is `;`/`,`-separated like the CSV. */
export type ManualDraft = Record<ManualField, string>;

const NUMBER_FIELDS = new Set<ManualField>(['series_order', 'timeline_order']);

export function splitList(value: string): string[] {
	return value
		.split(/[;,]/)
		.map((s) => s.trim())
		.filter(Boolean);
}

/** The draft a form starts from: the row's current values as strings. */
export function draftFromBook(book: ManualBook): ManualDraft {
	const draft = {} as ManualDraft;
	for (const f of MANUAL_FIELDS) {
		const v = book[f];
		draft[f] = f === 'author' ? (book.author ?? []).join('; ') : v == null ? '' : String(v);
	}
	return draft;
}

function draftValue(field: ManualField, raw: string): unknown {
	const t = raw.trim();
	if (field === 'author') return splitList(t);
	// Title and the enums are NOT NULL: pass '' through so validation rejects it.
	if (field === 'title' || field === 'canon' || field === 'type') return t;
	if (t === '') return null;
	// Non-numeric input becomes NaN, which the schema rejects instead of clearing.
	if (NUMBER_FIELDS.has(field)) return Number(t);
	return t;
}

function sameValue(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => v === b[i]);
	}
	return a === b;
}

/**
 * Patch of only the fields the draft changed: trims text, `''` → null for
 * nullable columns, author split on `;`/`,`. Validate the result with
 * `patchSchema` (client for inline errors, server in `patchBook`).
 */
export function manualEditPatch(book: ManualBook, draft: ManualDraft): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	for (const f of MANUAL_FIELDS) {
		const next = draftValue(f, draft[f]);
		const current = f === 'author' ? (book.author ?? []) : (book[f] ?? null);
		if (!sameValue(next, current)) patch[f] = next;
	}
	return patch;
}
