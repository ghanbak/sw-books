import { describe, expect, it } from 'vitest';

import { showsCoverFallback } from '@/lib/cover-fallback';

const A = 'https://covers.example/a.jpg';
const B = 'https://covers.example/b.jpg';

describe('showsCoverFallback', () => {
	it('shows the fallback when there is no cover', () => {
		expect(showsCoverFallback(null, null)).toBe(true);
		expect(showsCoverFallback('', null)).toBe(true);
	});

	it('shows the image until it fails', () => {
		expect(showsCoverFallback(A, null)).toBe(false);
		expect(showsCoverFallback(A, A)).toBe(true);
	});

	it("doesn't keep the previous book's fallback when a recycled row gets a new cover", () => {
		// Row rendered book A, A's cover failed; the list recycles the row for book B.
		expect(showsCoverFallback(B, A)).toBe(false);
	});

	it('shows the fallback again if the row is recycled back to the failed cover', () => {
		expect(showsCoverFallback(A, A)).toBe(true);
	});
});
