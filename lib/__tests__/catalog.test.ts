import { describe, expect, it } from 'vitest';
import { type CatalogOverrides, buildBookFields, parseDate, pickCoverImage, splitMultiValue } from '../catalog';

const emptyOverrides: CatalogOverrides = {
	isbn: {},
	primaryIsbn: {},
	pipelineCovers: {},
	manualCovers: {},
	rejectedSlugs: new Set(),
	manualFormats: {},
};

const baseRecord: Record<string, string> = {
	title: 'Light of the Jedi',
	id: '1',
	slug: 'light-of-the-jedi',
	author: 'Charles Soule',
	cover_image: 'https://images2.penguinrandomhouse.com/cover/9780593157718',
	canon: 'Canon',
	characters: '',
	date_published: 'January 5, 2021',
	format: 'Hardcover;Paperback;eBook',
	isbn: '9780593157718',
	language: '',
	publisher: 'Del Rey',
	series: 'Yes',
	series_name: 'The High Republic (Phase I)',
	series_order: '1',
	timeline_order: '-232',
	synopsis: 'A desperate rescue.',
	type: 'Adult Novel',
	asin: '',
	era: '',
	amazon_affiliate_link: '',
};

describe('catalog helpers', () => {
	it('parseDate normalizes to YYYY-MM-DD', () => {
		expect(parseDate('January 5, 2021')).toBe('2021-01-05');
		expect(parseDate('')).toBe(null);
		expect(parseDate('not a date')).toBe(null);
	});

	it('splitMultiValue splits, trims, dedupes', () => {
		expect(splitMultiValue('A; B;A')).toEqual(['A', 'B']);
		expect(splitMultiValue('')).toEqual([]);
	});

	it('pickCoverImage precedence', () => {
		expect(pickCoverImage('manual', 'https://x.com/c.jpg', 'pipe')).toBe('manual');
		// non-pipeline CSV cover is kept
		expect(pickCoverImage(undefined, 'https://images2.penguinrandomhouse.com/x', 'pipe')).toBe(
			'https://images2.penguinrandomhouse.com/x',
		);
		// pipeline-hosted CSV cover is distrusted → use pipeline override
		expect(pickCoverImage(undefined, 'https://covers.openlibrary.org/x', 'pipe')).toBe('pipe');
		expect(pickCoverImage(undefined, null, undefined)).toBe(null);
	});
});

describe('buildBookFields', () => {
	it('maps a record with CSV defaults', () => {
		const f = buildBookFields(baseRecord, emptyOverrides);
		expect(f.slug).toBe('light-of-the-jedi');
		expect(f.author).toEqual(['Charles Soule']);
		expect(f.date_published).toBe('2021-01-05');
		expect(f.format).toEqual(['Hardcover', 'Paperback', 'eBook']);
		expect(f.isbn).toEqual(['9780593157718']);
		expect(f.primary_isbn).toBe('9780593157718');
		expect(f.language).toBe('English');
		expect(f.cover_image).toBe('https://images2.penguinrandomhouse.com/cover/9780593157718');
		expect(f.series_order).toBe(1);
		expect(f.timeline_order).toBe(-232);
	});

	it('applies isbn / primary / cover / format overrides', () => {
		const f = buildBookFields(baseRecord, {
			...emptyOverrides,
			isbn: { 'light-of-the-jedi': ['111', '222'] },
			primaryIsbn: { 'light-of-the-jedi': '222' },
			manualCovers: { 'light-of-the-jedi': 'https://manual/cover.jpg' },
			manualFormats: { 'light-of-the-jedi': ['eBook'] },
		});
		expect(f.isbn).toEqual(['111', '222']);
		expect(f.primary_isbn).toBe('222');
		expect(f.cover_image).toBe('https://manual/cover.jpg');
		expect(f.format).toEqual(['eBook']);
	});

	it('distrusts the CSV cover for a rejected slug', () => {
		const f = buildBookFields(baseRecord, {
			...emptyOverrides,
			rejectedSlugs: new Set(['light-of-the-jedi']),
			pipelineCovers: { 'light-of-the-jedi': 'https://pipeline/cover.jpg' },
		});
		expect(f.cover_image).toBe('https://pipeline/cover.jpg');
	});
});
