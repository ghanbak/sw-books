import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	type LookupBook,
	type LookupSelection,
	SCALAR_FIELDS,
	buildLookupPatch,
	pruneLookupSelection,
} from './lookup-selection';
import type { BookCandidate, LookupResult } from './types';

const BOOK: LookupBook = {
	cover_image: 'https://covers.test/current.jpg',
	publisher: 'Del Rey',
	date_published: '2015-01-01',
	language: 'English',
	synopsis: 'Current synopsis',
	format: ['Paperback'],
	isbn: ['9780000000001', '9780000000002'],
	primary_isbn: '9780000000002',
};

const EMPTY_BOOK: LookupBook = {
	cover_image: null,
	publisher: null,
	date_published: null,
	language: null,
	synopsis: null,
	format: null,
	isbn: null,
	primary_isbn: null,
};

function lookup(gb: BookCandidate = {}, ol: BookCandidate = {}): LookupResult {
	return { ol, gb, fetchedAt: '2026-11-09T00:00:00.000Z' };
}

describe('buildLookupPatch scalar fields', () => {
	describe.each(SCALAR_FIELDS)('%s', (field) => {
		const selection: LookupSelection = { [field]: 'gb' };

		it('writes nothing when the selected source returned nothing', () => {
			expect(buildLookupPatch(BOOK, lookup(), selection, false)).toEqual({});
		});

		it('writes nothing when the selected source value is null', () => {
			expect(buildLookupPatch(BOOK, lookup({ [field]: null }), selection, false)).toEqual({});
		});

		it('writes nothing when the selected source value is an empty string', () => {
			expect(buildLookupPatch(BOOK, lookup({ [field]: '' }), selection, false)).toEqual({});
		});

		it('writes a new non-null value', () => {
			expect(buildLookupPatch(BOOK, lookup({ [field]: 'new' }), selection, false)).toEqual({
				[field]: 'new',
			});
		});

		it('writes nothing when the source value matches the book', () => {
			expect(buildLookupPatch(BOOK, lookup({ [field]: BOOK[field] }), selection, false)).toEqual(
				{},
			);
		});

		it('writes nothing for a current selection, even on an empty book', () => {
			expect(
				buildLookupPatch(EMPTY_BOOK, lookup({ [field]: 'new' }), { [field]: 'current' }, false),
			).toEqual({});
		});
	});
});

describe('buildLookupPatch format', () => {
	it('writes nothing when the selected source returned nothing', () => {
		expect(buildLookupPatch(BOOK, lookup(), { format: 'gb' }, false)).toEqual({});
	});

	it('writes nothing when the selected source has an empty list', () => {
		expect(buildLookupPatch(BOOK, lookup({ format: [] }), { format: 'gb' }, false)).toEqual({});
	});

	it('writes a new non-empty list', () => {
		expect(
			buildLookupPatch(BOOK, lookup({ format: ['Hardcover'] }), { format: 'gb' }, false),
		).toEqual({ format: ['Hardcover'] });
	});

	it('still writes a list equal to the current one', () => {
		expect(
			buildLookupPatch(BOOK, lookup({ format: ['Paperback'] }), { format: 'gb' }, false),
		).toEqual({ format: ['Paperback'] });
	});

	it('writes nothing for a current selection', () => {
		expect(
			buildLookupPatch(BOOK, lookup({ format: ['Hardcover'] }), { format: 'current' }, false),
		).toEqual({});
	});
});

describe('buildLookupPatch isbn', () => {
	it('does not clear ISBNs on Replace when the selected source returned nothing', () => {
		expect(buildLookupPatch(BOOK, lookup(), { isbn: 'gb' }, true)).toEqual({});
	});

	it('does not clear ISBNs on Replace when the selected source has an empty list', () => {
		expect(buildLookupPatch(BOOK, lookup({ isbn: [] }), { isbn: 'gb' }, true)).toEqual({});
	});

	it('writes nothing on merge when the selected source returned nothing', () => {
		expect(buildLookupPatch(BOOK, lookup(), { isbn: 'gb' }, false)).toEqual({});
	});

	it('replaces the list and repoints a primary that is gone', () => {
		expect(
			buildLookupPatch(BOOK, lookup({ isbn: ['9780000000009'] }), { isbn: 'gb' }, true),
		).toEqual({ isbn: ['9780000000009'], primary_isbn: '9780000000009' });
	});

	it('merges without duplicates and keeps a primary that is still present', () => {
		expect(
			buildLookupPatch(
				BOOK,
				lookup({ isbn: ['9780000000002', '9780000000009'] }),
				{ isbn: 'gb' },
				false,
			),
		).toEqual({
			isbn: ['9780000000001', '9780000000002', '9780000000009'],
			primary_isbn: '9780000000002',
		});
	});

	it('writes nothing for a current selection, even with Replace on', () => {
		expect(
			buildLookupPatch(BOOK, lookup({ isbn: ['9780000000009'] }), { isbn: 'current' }, true),
		).toEqual({});
	});
});

describe('Apply field count', () => {
	it('counts nothing for the stale publisher and format selections in #240', () => {
		const patch = buildLookupPatch(BOOK, lookup(), { publisher: 'gb', format: 'gb' }, false);
		expect(Object.keys(patch)).toEqual([]);
	});

	it('counts only the keys that have a value to write', () => {
		const patch = buildLookupPatch(
			BOOK,
			lookup({}, { publisher: 'Random House' }),
			{ publisher: 'ol', format: 'gb', synopsis: 'gb', isbn: 'gb' },
			true,
		);
		expect(Object.keys(patch)).toEqual(['publisher']);
	});

	it('counts format when its source has a value', () => {
		const patch = buildLookupPatch(
			BOOK,
			lookup({ format: ['Hardcover'], publisher: 'Random House' }),
			{ publisher: 'gb', format: 'gb' },
			false,
		);
		expect(Object.keys(patch).sort()).toEqual(['format', 'publisher']);
	});

	it('counts isbn and primary_isbn as the two keys it writes', () => {
		const patch = buildLookupPatch(
			BOOK,
			lookup({ isbn: ['9780000000009'] }),
			{ isbn: 'gb' },
			false,
		);
		expect(Object.keys(patch).sort()).toEqual(['isbn', 'primary_isbn']);
	});
});

describe('pruneLookupSelection', () => {
	describe.each(SCALAR_FIELDS)('%s', (field) => {
		it('drops a selection whose source returned nothing', () => {
			expect(pruneLookupSelection({ [field]: 'gb' }, lookup()).selection).toEqual({});
		});

		it('drops a selection whose source value is null or empty', () => {
			expect(pruneLookupSelection({ [field]: 'gb' }, lookup({ [field]: null })).selection).toEqual(
				{},
			);
			expect(pruneLookupSelection({ [field]: 'gb' }, lookup({ [field]: '' })).selection).toEqual(
				{},
			);
		});

		it('keeps a selection whose source still has a value', () => {
			expect(pruneLookupSelection({ [field]: 'gb' }, lookup({ [field]: 'x' })).selection).toEqual({
				[field]: 'gb',
			});
		});
	});

	it('drops a format selection whose source has no list', () => {
		expect(pruneLookupSelection({ format: 'gb' }, lookup()).selection).toEqual({});
		expect(pruneLookupSelection({ format: 'gb' }, lookup({ format: [] })).selection).toEqual({});
	});

	it('keeps a format selection whose source has a list', () => {
		expect(
			pruneLookupSelection({ format: 'gb' }, lookup({ format: ['Hardcover'] })).selection,
		).toEqual({ format: 'gb' });
	});

	it('reports when the ISBN selection is dropped', () => {
		expect(pruneLookupSelection({ isbn: 'gb' }, lookup())).toEqual({
			selection: {},
			isbnDropped: true,
		});
	});

	it('does not report the ISBN selection when it survives', () => {
		expect(pruneLookupSelection({ isbn: 'gb' }, lookup({ isbn: ['9780000000009'] }))).toEqual({
			selection: { isbn: 'gb' },
			isbnDropped: false,
		});
	});

	it('does not report the ISBN selection when another field is dropped', () => {
		expect(pruneLookupSelection({ publisher: 'gb' }, lookup()).isbnDropped).toBe(false);
	});

	it('keeps current selections when the sources are empty', () => {
		const selection: LookupSelection = { publisher: 'current', isbn: 'current' };
		expect(pruneLookupSelection(selection, lookup())).toEqual({ selection, isbnDropped: false });
	});

	it('checks each selection against its own source', () => {
		expect(
			pruneLookupSelection(
				{ publisher: 'ol', synopsis: 'gb' },
				lookup({ publisher: 'GB publisher' }, { synopsis: 'OL synopsis' }),
			).selection,
		).toEqual({});
	});

	it('does not mutate the selection it is given', () => {
		const selection: LookupSelection = { publisher: 'gb' };
		pruneLookupSelection(selection, lookup());
		expect(selection).toEqual({ publisher: 'gb' });
	});

	it('leaves nothing to apply after the #240 re-lookup', () => {
		const empty = lookup();
		const { selection } = pruneLookupSelection({ publisher: 'gb', format: 'gb' }, empty);
		expect(buildLookupPatch(BOOK, empty, selection, false)).toEqual({});
	});
});

describe('diff view lookup wiring (#240)', () => {
	const src = readFileSync(
		resolve(__dirname, '../../admin/app/admin/books/[slug]/_components/diff-view.tsx'),
		'utf8',
	);

	it('imports the helper', () => {
		expect(src).toMatch(/from '@app\/sources\/lookup-selection'/);
	});

	it('builds the patch with the helper and derives the count from it', () => {
		expect(src).toMatch(
			/const patch = buildLookupPatch\(\s*book,\s*candidates,\s*selection,\s*replaceIsbn,?\s*\)/,
		);
		expect(src).toMatch(/changeCount = Object\.keys\(patch\)\.length/);
		expect(src).not.toMatch(/function buildPatch/);
	});

	it('applies the same patch it counted', () => {
		expect(src).toMatch(/patchBook\(\s*book\.id,\s*book\.updated_at,\s*patch,?\s*\)/);
	});

	it('prunes the selection when new candidates land', () => {
		expect(src).toMatch(/pruneLookupSelection\(\s*selection,\s*candidates,?\s*\)/);
		expect(src).toMatch(/setSelection\(\s*pruned\.selection,?\s*\)/);
	});

	it('clears the Replace state when the ISBN selection is dropped', () => {
		expect(src).toMatch(
			/if \(pruned\.isbnDropped\) \{\s*setReplaceIsbn\(false\);\s*setConfirmSlug\(''\);\s*\}/,
		);
	});
});
