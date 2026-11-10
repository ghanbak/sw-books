import type { Book } from '@/lib/hooks';
import { describe, expect, it } from 'vitest';
import { selectBarcodeLookupResult } from './barcode-lookup';

const ISBN = '9780593157749';
const book = { id: 'b1', slug: 'thrawn', title: 'Thrawn' } as unknown as Book;

describe('selectBarcodeLookupResult', () => {
	it('returns an error result when the lookup resolves with an error (network/server failure)', () => {
		const error = { message: 'TypeError: Network request failed', code: '', details: '', hint: '' };
		expect(selectBarcodeLookupResult(ISBN, { data: null, error })).toEqual({ type: 'error' });
	});

	it('prefers the error over any data that came back alongside it', () => {
		expect(selectBarcodeLookupResult(ISBN, { data: [], error: { message: 'boom' } })).toEqual({
			type: 'error',
		});
	});

	it('returns not_found with the scanned ISBN for an empty, error-free result', () => {
		expect(selectBarcodeLookupResult(ISBN, { data: [], error: null })).toEqual({
			type: 'not_found',
			isbn: ISBN,
		});
	});

	it('returns the first matching book as found', () => {
		expect(selectBarcodeLookupResult(ISBN, { data: [book], error: null })).toEqual({
			type: 'found',
			book,
		});
	});
});
