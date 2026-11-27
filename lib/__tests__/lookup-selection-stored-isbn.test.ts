import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, patchSchema } from '../book-schema';
import { type LookupBook, buildLookupPatch, previewIsbns } from '../sources/lookup-selection';
import type { LookupResult } from '../sources/types';

// #476: a merge Apply must not resend stored ISBNs that fail save-time normalization.

function book(isbn: string[], primary_isbn: string | null): LookupBook {
	return {
		cover_image: null,
		publisher: null,
		date_published: null,
		language: null,
		synopsis: null,
		format: [],
		isbn,
		primary_isbn,
	};
}

function gb(isbn: string[]): LookupResult {
	return { ol: {}, gb: { isbn }, fetchedAt: '2026-11-27T00:00:00.000Z' };
}

// x-wing-iron-fist: 9780553570098 has a bad check digit and is the primary.
const IRON_FIST = book(['9780553570098', '9780553568011'], '9780553570098');

describe('merge Apply with an invalid stored ISBN', () => {
	it('drops the invalid value, repoints primary, and passes patchSchema', () => {
		const patch = buildLookupPatch(IRON_FIST, gb(['9780593157718']), { isbn: 'gb' }, false);
		expect(patch.isbn).toEqual(['9780553568011', '9780593157718']);
		expect(patch.primary_isbn).toBe('9780553568011');
		expect(patchSchema.safeParse(patch).success).toBe(true);
	});

	it('folds a stored ISBN-10 into its incoming ISBN-13', () => {
		const patch = buildLookupPatch(
			book(['0345391802'], '0345391802'),
			gb(['9780345391803']),
			{ isbn: 'gb' },
			false,
		);
		expect(patch.isbn).toEqual(['9780345391803']);
		expect(patch.primary_isbn).toBe('9780345391803');
		expect(patchSchema.safeParse(patch).success).toBe(true);
	});

	it('keeps a normalized stored primary that is still present', () => {
		const { isbns, primary } = previewIsbns(
			book(['9780553570098', '978-0-345-39180-3'], '978-0-345-39180-3'),
			gb(['9780593157718']),
			'gb',
			false,
		);
		expect(isbns).toEqual(['9780345391803', '9780593157718']);
		expect(primary).toBe('9780345391803');
	});

	it('reports the stored values the merge drops', () => {
		const { dropped } = previewIsbns(IRON_FIST, gb(['9780593157718']), 'gb', false);
		expect(dropped).toEqual(['9780553570098']);
	});

	it('reports nothing dropped when every stored value is valid', () => {
		const { dropped } = previewIsbns(
			book(['9780553568011'], null),
			gb(['9780593157718']),
			'gb',
			false,
		);
		expect(dropped).toEqual([]);
	});
});

describe('rejected ISBN error', () => {
	it('names the offending value', () => {
		const res = patchSchema.safeParse({ isbn: ['9780553570098'] });
		expect(res.success).toBe(false);
		if (res.success) return;
		expect(firstIssueMessage(res.error, '')).toContain('9780553570098');
	});
});

describe('diff view wiring', () => {
	const src = readFileSync(
		resolve(__dirname, '../../admin/app/admin/books/[slug]/_components/diff-view.tsx'),
		'utf8',
	);

	it('reads the dropped list from previewIsbns', () => {
		expect(src).toMatch(/dropped:\s*droppedIsbns[\s\S]*?\}\s*=\s*previewIsbns\(/);
	});

	it('shows the dropped values in the preview', () => {
		expect(src).toMatch(/will remove invalid/);
		expect(src).toMatch(/droppedIsbns\.join\(/);
	});
});
