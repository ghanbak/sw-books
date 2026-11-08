import { describe, expect, it } from 'vitest';
import {
	type ManualBook,
	createSchema,
	draftFromBook,
	firstIssueMessage,
	issuesByField,
	manualEditPatch,
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
