import { describe, expect, it } from 'vitest';

import {
	addToOwnedLabel,
	barcodeResultAnnouncement,
	finishScanLabel,
	hiddenDecorationProps,
	photosCapturedLabel,
	reviewMatchLabel,
	swapCandidateLabel,
} from '@/lib/scan-a11y';

describe('scan a11y labels', () => {
	it('pluralizes photo counts', () => {
		expect(photosCapturedLabel(1)).toBe('1 photo captured');
		expect(photosCapturedLabel(3)).toBe('3 photos captured');
		expect(finishScanLabel(1)).toBe('Finish scanning, 1 photo taken');
		expect(finishScanLabel(20)).toBe('Finish scanning, 20 photos taken');
	});

	it('matches the visible add-button text when nothing is selected', () => {
		expect(addToOwnedLabel(0)).toBe('Nothing selected');
		expect(addToOwnedLabel(1)).toBe('Add 1 book to Owned');
		expect(addToOwnedLabel(4)).toBe('Add 4 books to Owned');
	});

	it('suffixes owned over low-confidence on review matches', () => {
		const base = { title: 'Heir to the Empire', authors: ['Timothy Zahn'] };
		expect(reviewMatchLabel({ ...base, owned: false, lowConfidence: false })).toBe(
			'Heir to the Empire by Timothy Zahn',
		);
		expect(reviewMatchLabel({ ...base, owned: false, lowConfidence: true })).toBe(
			'Heir to the Empire by Timothy Zahn, double-check this match',
		);
		expect(reviewMatchLabel({ ...base, owned: true, lowConfidence: true })).toBe(
			'Heir to the Empire by Timothy Zahn, already owned',
		);
		expect(
			reviewMatchLabel({ title: 'Untitled', authors: [], owned: false, lowConfidence: false }),
		).toBe('Untitled');
	});

	it('names swap candidates with author and owned state', () => {
		expect(swapCandidateLabel({ title: 'Catalyst', authors: ['James Luceno'], owned: true })).toBe(
			'Swap to Catalyst by James Luceno, already owned',
		);
		expect(swapCandidateLabel({ title: 'Catalyst', authors: [], owned: false })).toBe(
			'Swap to Catalyst',
		);
	});

	it('hides decorative review covers from screen readers and touch (iOS + Android)', () => {
		expect(hiddenDecorationProps).toEqual({
			pointerEvents: 'none',
			accessibilityElementsHidden: true,
			importantForAccessibility: 'no-hide-descendants',
		});
	});

	it('announces every barcode result kind', () => {
		expect(barcodeResultAnnouncement('found', 'Dune')).toBe('Found Dune');
		expect(barcodeResultAnnouncement('found')).toBe('Book found');
		expect(barcodeResultAnnouncement('not_found')).toBe('Not in the Archive');
		expect(barcodeResultAnnouncement('invalid')).toBe('Invalid barcode');
		expect(barcodeResultAnnouncement('error')).toMatch(/^Lookup failed/);
	});
});
