import { describe, expect, it } from 'vitest';

import type { Book } from '@/lib/hooks';
import {
	buildIsbnIndex,
	finishCapturedLabel,
	highConfidenceBooks,
	isRepeatBarcode,
	mergeCapturedIntoMatches,
	prependCaptured,
	resolveBarcode,
	selectScanViewState,
} from '@/lib/scan-capture';
import type { SpineMatch } from '@/lib/spine-match';

const book = (id: string, isbn: string[] | null = null): Book =>
	({ id, title: `Book ${id}`, author: [], isbn, cover_image: null }) as unknown as Book;

const match = (b: Book, bucket: 'high' | 'low' = 'high'): SpineMatch => ({
	book: b,
	score: 0.9,
	margin: 0.9,
	bucket,
	supports: 1,
	alternates: [],
});

const ids = (books: Book[]) => books.map((b) => b.id);

describe('prependCaptured', () => {
	it('three scans in a row add three books, newest at index 0', () => {
		let captured: Book[] = [];
		captured = prependCaptured(captured, [book('a')]);
		captured = prependCaptured(captured, [book('b')]);
		captured = prependCaptured(captured, [book('c')]);
		expect(ids(captured)).toEqual(['c', 'b', 'a']);
	});

	it('a duplicate scan does not add twice and keeps the original position', () => {
		let captured = prependCaptured([], [book('a')]);
		captured = prependCaptured(captured, [book('b')]);
		captured = prependCaptured(captured, [book('a')]);
		expect(ids(captured)).toEqual(['b', 'a']);
	});

	it('returns the same array when nothing is new (no re-render)', () => {
		const captured = prependCaptured([], [book('a')]);
		expect(prependCaptured(captured, [book('a')])).toBe(captured);
		expect(prependCaptured(captured, [])).toBe(captured);
	});

	it('dedupes within one incoming batch', () => {
		expect(ids(prependCaptured([book('z')], [book('a'), book('a'), book('b')]))).toEqual([
			'a',
			'b',
			'z',
		]);
	});
});

describe('highConfidenceBooks', () => {
	it('keeps only high-bucket matches for the live tray', () => {
		const out = highConfidenceBooks([match(book('a')), match(book('b'), 'low')]);
		expect(ids(out)).toEqual(['a']);
	});
});

describe('mergeCapturedIntoMatches', () => {
	it('adds tray books the final match pass missed as certain matches, tray order first', () => {
		const matches = [match(book('a'))];
		const merged = mergeCapturedIntoMatches(matches, [book('c'), book('a'), book('b')]);
		expect(merged.map((m) => m.book.id)).toEqual(['c', 'a', 'b']);
		expect(merged[0]).toMatchObject({ bucket: 'high', score: 1, alternates: [] });
	});

	it('promotes a tray book the matcher only rated low', () => {
		const merged = mergeCapturedIntoMatches([match(book('a'), 'low')], [book('a')]);
		expect(merged).toHaveLength(1);
		expect(merged[0].bucket).toBe('high');
	});

	it('returns the matches unchanged when the tray is empty', () => {
		const matches = [match(book('a'))];
		expect(mergeCapturedIntoMatches(matches, [])).toEqual(matches);
	});
});

describe('resolveBarcode', () => {
	const sw = book('sw', ['9780345391803']);
	const index = buildIsbnIndex([sw, book('none')]);

	it('a catalog ISBN resolves to its book', () => {
		expect(resolveBarcode('9780345391803', index, [])).toEqual({ type: 'added', book: sw });
	});

	it('an ISBN-10 barcode resolves through normalization', () => {
		expect(resolveBarcode('0345391802', index, [])).toEqual({ type: 'added', book: sw });
	});

	it('an ISBN already in the tray is a duplicate, not an add', () => {
		expect(resolveBarcode('9780345391803', index, [sw])).toEqual({ type: 'duplicate', book: sw });
	});

	it('a valid ISBN outside the catalog is the not-Star-Wars state', () => {
		expect(resolveBarcode('9780306406157', index, [])).toEqual({
			type: 'not_star_wars',
			isbn: '9780306406157',
		});
	});

	it('a non-ISBN barcode is invalid', () => {
		expect(resolveBarcode('12345', index, [])).toEqual({ type: 'invalid' });
	});
});

describe('isRepeatBarcode', () => {
	it('ignores the same code within the cooldown, accepts it after, accepts a new code', () => {
		const last = { data: 'x', at: 1000 };
		expect(isRepeatBarcode(last, 'x', 2500)).toBe(true);
		expect(isRepeatBarcode(last, 'x', 3001)).toBe(false);
		expect(isRepeatBarcode(last, 'y', 1001)).toBe(false);
		expect(isRepeatBarcode(null, 'x', 0)).toBe(false);
	});
});

describe('selectScanViewState', () => {
	const ready = { catalogReady: true, catalogError: null };

	it('null permission is the checking state', () => {
		expect(selectScanViewState({ permission: null, ...ready })).toBe('checking_permission');
	});

	it('denied permission wins over catalog state', () => {
		expect(
			selectScanViewState({
				permission: { granted: false, canAskAgain: true },
				catalogReady: false,
				catalogError: 'x',
			}),
		).toBe('permission_prompt');
		expect(
			selectScanViewState({ permission: { granted: false, canAskAgain: false }, ...ready }),
		).toBe('permission_denied');
	});

	it('granted: catalog loading, then error, then scanning', () => {
		const granted = { granted: true, canAskAgain: true };
		expect(
			selectScanViewState({ permission: granted, catalogReady: false, catalogError: null }),
		).toBe('catalog_loading');
		expect(
			selectScanViewState({ permission: granted, catalogReady: false, catalogError: 'boom' }),
		).toBe('catalog_error');
		expect(selectScanViewState({ permission: granted, ...ready })).toBe('scanning');
	});
});

describe('finishCapturedLabel', () => {
	it('pluralizes the captured-book count', () => {
		expect(finishCapturedLabel(1)).toBe('Finish scanning, 1 book captured');
		expect(finishCapturedLabel(3)).toBe('Finish scanning, 3 books captured');
	});
});
