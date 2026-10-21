import { describe, expect, it } from 'vitest';
import { gbVolumeIsbns } from './lookup';

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
