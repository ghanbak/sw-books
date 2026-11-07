import { displayIsbn } from '@/lib/isbn';
import { describe, expect, it } from 'vitest';

describe('displayIsbn', () => {
	it('prefers primary_isbn over isbn[0]', () => {
		expect(
			displayIsbn({ primary_isbn: '9780593128374', isbn: ['9781529150087', '9780593128374'] }),
		).toBe('9780593128374');
	});

	it('falls back to isbn[0] when primary_isbn is null', () => {
		expect(displayIsbn({ primary_isbn: null, isbn: ['9781529150087'] })).toBe('9781529150087');
	});

	it('returns null when both are empty', () => {
		expect(displayIsbn({ primary_isbn: null, isbn: [] })).toBeNull();
		expect(displayIsbn({ primary_isbn: null, isbn: null })).toBeNull();
	});
});
