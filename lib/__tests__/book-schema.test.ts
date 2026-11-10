import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	type ManualBook,
	createSchema,
	draftFromBook,
	firstIssueMessage,
	issuesByField,
	manualEditPatch,
	numOrNull,
	patchSchema,
} from '../book-schema';

function reject(patch: unknown): string {
	const res = patchSchema.safeParse(patch);
	if (res.success) throw new Error(`expected ${JSON.stringify(patch)} to be rejected`);
	return firstIssueMessage(res.error, 'invalid');
}

const BOOK: ManualBook = {
	title: 'Thrawn',
	author: ['Timothy Zahn'],
	cover_image: 'https://covers.openlibrary.org/b/id/1-L.jpg',
	synopsis: null,
	publisher: 'Del Rey',
	date_published: '2017-04-11',
	era: null,
	series_name: 'Thrawn',
	series_order: 1,
	timeline_order: -2,
	canon: 'Canon',
	type: 'Adult Novel',
};

describe('patchSchema', () => {
	it('accepts hand-entered cover, synopsis, author, series, canon and type', () => {
		const res = patchSchema.safeParse({
			cover_image: 'https://example.com/covers/thrawn.jpg',
			synopsis: 'A Chiss officer rises through the Imperial ranks.',
			author: ['Timothy Zahn', 'Marc Thompson'],
			series_name: 'Thrawn',
			series_order: 2,
			timeline_order: -1.5,
			canon: 'Legends',
			type: 'YA Novel',
		});
		expect(res.success).toBe(true);
	});

	it('accepts a local-storage cover and clearing the cover', () => {
		expect(patchSchema.safeParse({ cover_image: 'http://127.0.0.1:54321/c.jpg' }).success).toBe(
			true,
		);
		expect(patchSchema.safeParse({ cover_image: null }).success).toBe(true);
	});

	it.each(['not a url', 'covers/thrawn.jpg', 'ftp://example.com/c.jpg', 'javascript:alert(1)'])(
		'rejects non-http(s) cover %j and names the field',
		(cover_image) => {
			expect(reject({ cover_image })).toMatch(/^cover_image: /);
		},
	);

	it('rejects unknown canon and type values', () => {
		expect(reject({ canon: 'Disney' })).toMatch(/^canon: /);
		expect(reject({ canon: 'canon' })).toMatch(/^canon: /);
		expect(reject({ type: 'Comic' })).toMatch(/^type: /);
	});

	it('rejects non-integer series order and non-numeric timeline order', () => {
		expect(reject({ series_order: 1.5 })).toMatch(/^series_order: /);
		expect(reject({ timeline_order: Number.NaN })).toMatch(/^timeline_order: /);
	});

	it('rejects empty title and empty author names', () => {
		expect(reject({ title: '' })).toMatch(/^title: /);
		expect(reject({ author: ['Timothy Zahn', '  '] })).toMatch(/^author\.1: /);
	});

	it('rejects clearing every author (#172)', () => {
		expect(reject({ author: [] })).toMatch(/^author: /);
	});

	it('keeps the primary_isbn membership rule', () => {
		expect(reject({ isbn: ['9780345511270'], primary_isbn: '9780000000000' })).toMatch(
			/^primary_isbn: /,
		);
	});
});

describe('createSchema', () => {
	it('applies the same cover rule', () => {
		const base = { title: 'X', slug: 'x', canon: 'Canon', type: 'Adult Novel' };
		expect(createSchema.safeParse({ ...base, cover_image: 'nope' }).success).toBe(false);
		expect(createSchema.safeParse(base).success).toBe(true);
	});

	it('still allows a book with no author (create path is not narrowed)', () => {
		const base = { title: 'X', slug: 'x', canon: 'Canon', type: 'Adult Novel' };
		expect(createSchema.safeParse({ ...base, author: [] }).success).toBe(true);
	});
});

describe('numOrNull (new-book form, #234)', () => {
	const BASE = { title: 'X', slug: 'x', canon: 'Canon', type: 'Adult Novel' };
	const FORM = resolve(__dirname, '../../admin/app/admin/books/new/_components/new-book-form.tsx');

	function createError(input: Record<string, unknown>): string {
		const res = createSchema.safeParse({ ...BASE, ...input });
		if (res.success) throw new Error(`expected ${JSON.stringify(input)} to be rejected`);
		return firstIssueMessage(res.error, 'invalid book');
	}

	it.each(['1O', '12a', 'soon', 'Infinity', '-Infinity', '1e999'])(
		'sends %j to createSchema as a field error, not null',
		(raw) => {
			expect(numOrNull(raw)).not.toBeNull();
			expect(createError({ timeline_order: numOrNull(raw) })).toMatch(/^timeline_order: /);
			expect(createError({ series_order: numOrNull(raw) })).toMatch(/^series_order: /);
		},
	);

	it.each(['', '   '])('maps empty input %j to null, and the book still validates', (raw) => {
		expect(numOrNull(raw)).toBeNull();
		const res = createSchema.safeParse({
			...BASE,
			series_order: numOrNull(raw),
			timeline_order: numOrNull(raw),
		});
		expect(res.success).toBe(true);
		if (res.success) {
			expect(res.data.series_order).toBeNull();
			expect(res.data.timeline_order).toBeNull();
		}
	});

	it('keeps valid numbers unchanged', () => {
		expect(numOrNull(' 12 ')).toBe(12);
		const res = createSchema.safeParse({
			...BASE,
			series_order: numOrNull('3'),
			timeline_order: numOrNull('-2.5'),
		});
		expect(res.success).toBe(true);
		if (res.success) {
			expect(res.data.series_order).toBe(3);
			expect(res.data.timeline_order).toBe(-2.5);
		}
	});

	it('is the parser the new-book form uses for both fields', () => {
		const source = readFileSync(FORM, 'utf8');
		expect(source).toMatch(/import\s*\{[^}]*\bnumOrNull\b[^}]*\}\s*from\s*'@app\/book-schema'/);
		expect(source).not.toMatch(/function\s+numOrNull\b/);
		expect(source).toMatch(/series_order:\s*numOrNull\(\s*form\.series_order\s*,?\s*\)/);
		expect(source).toMatch(/timeline_order:\s*numOrNull\(\s*form\.timeline_order\s*,?\s*\)/);
	});
});

describe('manualEditPatch', () => {
	it('is empty when nothing changed', () => {
		expect(manualEditPatch(BOOK, draftFromBook(BOOK))).toEqual({});
	});

	it('sends only changed fields, trimmed, with blanks cleared to null', () => {
		const draft = {
			...draftFromBook(BOOK),
			cover_image: '  https://example.com/new.jpg ',
			synopsis: ' Hand-written synopsis. ',
			series_name: '',
			author: 'Timothy Zahn, Marc Thompson',
			canon: 'Legends',
		};
		expect(manualEditPatch(BOOK, draft)).toEqual({
			cover_image: 'https://example.com/new.jpg',
			synopsis: 'Hand-written synopsis.',
			series_name: null,
			author: ['Timothy Zahn', 'Marc Thompson'],
			canon: 'Legends',
		});
	});

	it('parses numbers and lets the schema reject junk instead of clearing it', () => {
		const patch = manualEditPatch(BOOK, {
			...draftFromBook(BOOK),
			series_order: '3',
			timeline_order: 'soon',
		});
		expect(patch.series_order).toBe(3);
		const res = patchSchema.safeParse(patch);
		expect(res.success).toBe(false);
		if (!res.success) expect(Object.keys(issuesByField(res.error))).toEqual(['timeline_order']);
	});

	it('turns a cleared Author field into a field error, not an author: [] write (#172)', () => {
		const patch = manualEditPatch(BOOK, { ...draftFromBook(BOOK), author: ' ; , ' });
		expect(patch).toEqual({ author: [] });
		const res = patchSchema.safeParse(patch);
		expect(res.success).toBe(false);
		if (!res.success) expect(Object.keys(issuesByField(res.error))).toEqual(['author']);
	});

	it('passes a blank title through so validation rejects it', () => {
		const patch = manualEditPatch(BOOK, { ...draftFromBook(BOOK), title: '   ' });
		expect(patch).toEqual({ title: '' });
		expect(patchSchema.safeParse(patch).success).toBe(false);
	});
});
