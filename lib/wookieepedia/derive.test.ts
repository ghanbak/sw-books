import { describe, expect, it } from 'vitest';
import type { CategoryBucket } from './categories';
import { deriveBook } from './derive';
import type { ParsedBook } from './parse';

const CANON_ADULT: CategoryBucket = {
	category: 'Canon adult novels',
	canon: 'Canon',
	type: 'Adult Novel',
	recurseSubcats: true,
	band: [45, 85],
};
const LEGENDS: CategoryBucket = {
	category: 'Legends novels',
	canon: 'Legends',
	type: null,
	recurseSubcats: true,
	band: [135, 200],
};

function parsed(overrides: Partial<ParsedBook> = {}): ParsedBook {
	return {
		source_pageid: 646053,
		title: 'Light of the Jedi',
		coverImageUrl: 'https://static.wikia.nocookie.net/starwars/images/e/e2/Light.jpg',
		infobox: {
			author: '[[Charles Soule]]<ref name="p" />',
			publisher: '[[Del Rey]]',
			'release date': '[[January 5]], [[2021]]',
			isbn: '9780593157718',
			'media type': '*Hardcover<ref name="p" />\n*Paperback\n*eBook',
			audiobook: '[[Light of the Jedi (audiobook)|Audiobook]]',
			timeline: '[[232 BBY]]',
			series: '[[The High Republic]]',
			...overrides.infobox,
		},
		...overrides,
	};
}

describe('deriveBook', () => {
	it('derives a Canon adult novel row from infobox + bucket', () => {
		const row = deriveBook(parsed(), CANON_ADULT);
		expect(row.title).toBe('Light of the Jedi');
		expect(row.slug).toBe('light-of-the-jedi');
		expect(row.author).toEqual(['Charles Soule']);
		expect(row.canon).toBe('Canon');
		expect(row.type).toBe('Adult Novel');
		expect(row.date_published).toBe('2021-01-05');
		expect(row.isbn).toEqual(['9780593157718']);
		expect(row.primary_isbn).toBe('9780593157718');
		expect(row.timeline_order).toBe(-232);
		expect(row.series_name).toBe('The High Republic');
		expect(row.language).toBe('English');
		expect(row.cover_image).toContain('nocookie.net');
		expect(row.source_pageid).toBe(646053);
		// media type list + audiobook param → sorted (C-locale) format set.
		expect(row.format).toEqual(['Audiobook', 'Hardcover', 'Paperback', 'eBook']);
	});

	it('leaves Legends type empty (resolved at promotion) and keeps canon', () => {
		const row = deriveBook(parsed(), LEGENDS);
		expect(row.canon).toBe('Legends');
		expect(row.type).toBe('');
	});

	it('strips nested citation templates inside the author field (real failures)', () => {
		// Real wiki: author link + a <ref> wrapping a {{Twitter}}/{{SW}} citation
		// whose quote text contains `#`/`&#124;` — the splitter delimiters. Must
		// come through clean, never as `Claudia Gray{{Twitter|…}}`.
		const bloodline = deriveBook(
			parsed({
				infobox: {
					author:
						'[[Claudia Gray]]<ref name="x">{{Twitter|DelReyStarWars|status/1|quote=So excited #StarWars coming 2016.|archivefile=File:X.jpg}}</ref>',
				},
			}),
			CANON_ADULT,
		);
		expect(bloodline.author).toEqual(['Claudia Gray']);

		const thrawn = deriveBook(
			parsed({
				infobox: {
					author:
						'[[Timothy Zahn]]<ref name="r">{{SWYouTube|HBVhBsN1H7Q|Rebels Season 3 Panel &#124; Celebration 2016}}</ref>',
				},
			}),
			CANON_ADULT,
		);
		expect(thrawn.author).toEqual(['Timothy Zahn']);
	});

	it('splits co-authors on ` & ` as well as bullets/`;`', () => {
		const row = deriveBook(
			parsed({
				infobox: { author: '[[Michael Reaves]] & [[Maya Kaathryn Bohnhoff]]' },
			}),
			CANON_ADULT,
		);
		expect(row.author).toEqual(['Maya Kaathryn Bohnhoff', 'Michael Reaves']);
	});

	it('sorts and dedupes multi-value cells; nulls absent scalars', () => {
		const row = deriveBook(
			parsed({
				infobox: {
					author: '[[Steve Perry]]<br />[[Michael Reaves]]<br />[[Steve Perry]]',
					isbn: '9780593157718',
					isbn2: '978-0-345-38400-3',
				},
			}),
			CANON_ADULT,
		);
		expect(row.author).toEqual(['Michael Reaves', 'Steve Perry']);
		expect(row.isbn).toEqual(['9780345384003', '9780593157718']);
		expect(row.publisher).toBeNull();
		expect(row.series_name).toBeNull();
		expect(row.timeline_order).toBeNull();
		expect(row.series_order).toBeNull();
		expect(row.synopsis).toBeNull();
	});
});
