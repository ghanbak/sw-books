import { describe, expect, it } from 'vitest';
import { isValidIsbn10, normalizeIsbn } from '../isbn';

// #454: normalizeIsbn used to drop the ISBN-10 check digit and recompute an
// ISBN-13 one, so any 10-character string became a "valid" ISBN-13.
describe('normalizeIsbn ISBN-10 check digit', () => {
	it('converts a valid ISBN-10 to ISBN-13', () => {
		expect(normalizeIsbn('0345384008')).toBe('9780345384003');
	});

	it.each([
		['0345384005', 'wrong check digit'],
		['1234567890', 'wrong check digit'],
		['03453X4008', 'X outside the last position'],
		['03453X4009', 'X outside the last position, passes mod-11'],
	])('rejects %s (%s)', (input) => {
		expect(normalizeIsbn(input)).toBeNull();
	});

	it('accepts an X check digit in either case', () => {
		expect(normalizeIsbn('080442957X')).toBe('9780804429573');
		expect(normalizeIsbn('080442957x')).toBe('9780804429573');
	});

	it('leaves ISBN-13 handling unchanged', () => {
		expect(normalizeIsbn('9780593157718')).toBe('9780593157718');
		expect(normalizeIsbn('978-0-593-15771-8')).toBe('9780593157718');
		expect(normalizeIsbn('9780593157710')).toBeNull();
	});
});

describe('isValidIsbn10', () => {
	it('checks mod-11 with X only in the last position', () => {
		expect(isValidIsbn10('0345384008')).toBe(true);
		expect(isValidIsbn10('080442957X')).toBe(true);
		expect(isValidIsbn10('0345384005')).toBe(false);
		expect(isValidIsbn10('03453X4008')).toBe(false);
		// Mod-11 sum is 187 (11 × 17): only the X-position rule rejects it.
		expect(isValidIsbn10('03453X4009')).toBe(false);
	});
});
