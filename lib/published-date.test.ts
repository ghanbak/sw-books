import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatPublishedDate } from './published-date';

const ZONES = [
	{ zone: 'America/Los_Angeles', isNegative: true },
	{ zone: 'Pacific/Honolulu', isNegative: true },
	{ zone: 'UTC', isNegative: false },
	{ zone: 'Asia/Tokyo', isNegative: false },
];

describe('formatPublishedDate', () => {
	let originalTz: string | undefined;

	beforeEach(() => {
		originalTz = process.env.TZ;
	});

	afterEach(() => {
		// `process.env.TZ = undefined` would store the string "undefined".
		if (originalTz === undefined) Reflect.deleteProperty(process.env, 'TZ');
		else process.env.TZ = originalTz;
	});

	describe.each(ZONES)('in $zone', ({ zone, isNegative }) => {
		beforeEach(() => {
			process.env.TZ = zone;
		});

		// CI runs in UTC, where the bug is invisible, so prove the zone switch took effect.
		it('runs under the forced zone', () => {
			expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
			expect(new Date('2021-01-05').getTimezoneOffset() > 0).toBe(isNegative);
		});

		it('keeps the calendar day', () => {
			expect(formatPublishedDate('2021-01-05')).toBe('January 5, 2021');
		});

		it('keeps the month on the 1st', () => {
			expect(formatPublishedDate('2021-03-01')).toBe('March 1, 2021');
		});

		it('keeps the year on January 1', () => {
			expect(formatPublishedDate('2015-01-01')).toBe('January 1, 2015');
		});

		it('keeps the year on December 31', () => {
			expect(formatPublishedDate('2015-12-31')).toBe('December 31, 2015');
		});
	});

	it('returns null for a missing date', () => {
		expect(formatPublishedDate(null)).toBeNull();
	});
});

describe('book detail wiring', () => {
	const src = readFileSync(resolve(__dirname, '../app/book/[id].tsx'), 'utf8');

	it('formats the publish date with the lib helper', () => {
		expect(src).toMatch(/import\s*\{\s*formatPublishedDate\s*\}\s*from\s*'@\/lib\/published-date'/);
		expect(src).toMatch(/formatPublishedDate\(\s*book\.date_published\s*,?\s*\)/);
	});

	it('no longer has its own formatter', () => {
		expect(src).not.toMatch(/function\s+formatPublishedDate/);
		expect(src).not.toContain('toLocaleDateString');
	});
});
