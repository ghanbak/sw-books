import { describe, expect, it } from 'vitest';

import { isUuid } from './uuid';

describe('isUuid', () => {
	it('accepts a canonical uuid, either case', () => {
		expect(isUuid('3f2b8c1e-9a4d-4e6b-8c2f-1a2b3c4d5e6f')).toBe(true);
		expect(isUuid('3F2B8C1E-9A4D-4E6B-8C2F-1A2B3C4D5E6F')).toBe(true);
		expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
	});

	it('rejects slugs, typos and partial ids (#312)', () => {
		expect(isUuid('abc')).toBe(false);
		expect(isUuid('thrawn-alliances')).toBe(false);
		expect(isUuid('3f2b8c1e-9a4d-4e6b-8c2f-1a2b3c4d5e6')).toBe(false);
		expect(isUuid('3f2b8c1e-9a4d-4e6b-8c2f-1a2b3c4d5e6fa')).toBe(false);
		expect(isUuid('3f2b8c1e9a4d4e6b8c2f1a2b3c4d5e6f')).toBe(false);
		expect(isUuid('g f2b8c1e-9a4d-4e6b-8c2f-1a2b3c4d5e6f')).toBe(false);
		expect(isUuid(' 3f2b8c1e-9a4d-4e6b-8c2f-1a2b3c4d5e6f')).toBe(false);
	});

	it('rejects empty and non-string params', () => {
		expect(isUuid('')).toBe(false);
		expect(isUuid(undefined)).toBe(false);
		expect(isUuid(null)).toBe(false);
		expect(isUuid(['3f2b8c1e-9a4d-4e6b-8c2f-1a2b3c4d5e6f'])).toBe(false);
	});
});
