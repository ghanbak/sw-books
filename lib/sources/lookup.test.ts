import { afterEach, describe, expect, it } from 'vitest';
import { gbVolumeIsbns, toIsoDate } from './lookup';

describe('gbVolumeIsbns', () => {
	it('returns ISBN-13s, converting ISBN-10s and dropping non-ISBN identifiers', () => {
		expect(
			gbVolumeIsbns({
				industryIdentifiers: [
					{ type: 'ISBN_13', identifier: '9780593982662' },
					{ type: 'ISBN_10', identifier: '0593982665' },
					{ type: 'OTHER', identifier: 'UOM:39015034223597' },
				],
			}),
		).toEqual(['9780593982662']);
		expect(gbVolumeIsbns({})).toEqual([]);
	});
});

describe('toIsoDate', () => {
	const zones = ['UTC', 'Pacific/Auckland', 'Asia/Tokyo', 'America/Los_Angeles'];
	const originalTz = process.env.TZ;
	afterEach(() => {
		// `process.env.TZ = undefined` would store the string "undefined".
		if (originalTz === undefined) Reflect.deleteProperty(process.env, 'TZ');
		else process.env.TZ = originalTz;
	});

	for (const tz of zones) {
		it(`keeps the calendar day in ${tz}`, () => {
			process.env.TZ = tz;
			// Open Library publish_date shapes
			expect(toIsoDate('May 5, 2015')).toBe('2015-05-05');
			expect(toIsoDate('January 1, 2015')).toBe('2015-01-01');
			expect(toIsoDate('Oct 2015')).toBe('2015-10-01');
			expect(toIsoDate('5 May 2015')).toBe('2015-05-05');
			// Google Books publishedDate shapes
			expect(toIsoDate('2015-05-05')).toBe('2015-05-05');
			expect(toIsoDate('2015-05')).toBe('2015-05-01');
			expect(toIsoDate('2015')).toBe('2015-01-01');
		});
	}

	it('returns null for empty or unparseable input', () => {
		expect(toIsoDate(undefined)).toBe(null);
		expect(toIsoDate(null)).toBe(null);
		expect(toIsoDate('')).toBe(null);
		expect(toIsoDate('not a date')).toBe(null);
	});
});
