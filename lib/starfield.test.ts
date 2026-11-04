import { describe, expect, it } from 'vitest';

import { noCoverType, starCount, starfield } from './starfield';

describe('starfield', () => {
	it('is deterministic per seed and differs between seeds', () => {
		expect(starfield('Dark Disciple', 220)).toEqual(starfield('Dark Disciple', 220));
		expect(starfield('Dark Disciple', 220)).not.toEqual(starfield('Lords of the Sith', 220));
	});

	it('keeps every star on the cover with a sane size and brightness', () => {
		for (const s of starfield('A Valiant Vow', 220)) {
			expect(s.x).toBeGreaterThanOrEqual(0);
			expect(s.x).toBeLessThan(1);
			expect(s.y).toBeGreaterThanOrEqual(0);
			expect(s.y).toBeLessThan(1);
			expect(s.r).toBeGreaterThan(0);
			expect(s.r).toBeLessThanOrEqual(0.011);
			expect(s.a).toBeGreaterThanOrEqual(0.35);
			expect(s.a).toBeLessThanOrEqual(1);
		}
	});

	it('scales the star count with cover size, capped', () => {
		expect(starCount(32)).toBeLessThan(starCount(220));
		expect(starCount(1000)).toBe(48);
		expect(starfield('x', 66)).toHaveLength(starCount(66));
	});
});

describe('noCoverType', () => {
	it('is 1.75× the old 13pt title at hero size and keeps ≥8pt bottom padding', () => {
		expect(noCoverType(220).title).toBe(23);
		expect(noCoverType(32).title).toBe(9);
		expect(noCoverType(32).bottom).toBe(8);
		expect(noCoverType(220).bottom).toBeGreaterThanOrEqual(8);
	});
});
