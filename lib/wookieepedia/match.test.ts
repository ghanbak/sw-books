import { describe, expect, it } from 'vitest';
import type { BookFields } from '../catalog';
import type { DiscoveredBook } from './derive';
import {
	type CatalogBook,
	FUZZY_THRESHOLD,
	authorSurnameSet,
	classify,
	normalizeTitleKey,
	tokenSortRatio,
	unmatchedCatalog,
} from './match';

/** A fully-formed discovered row; override only what a case cares about. */
function discovered(overrides: Partial<DiscoveredBook> = {}): DiscoveredBook {
	return {
		title: 'Heir to the Empire',
		slug: 'heir-to-the-empire',
		author: ['Timothy Zahn'],
		cover_image: null,
		canon: 'Legends',
		date_published: '1991-05-01',
		format: ['Hardcover'],
		isbn: ['9780553296129'],
		primary_isbn: '9780553296129',
		language: 'English',
		publisher: 'Bantam Spectra',
		series_name: 'The Thrawn Trilogy',
		series_order: null,
		timeline_order: 9,
		synopsis: null,
		type: '',
		era: null,
		source_pageid: 1000,
		...overrides,
	};
}

/** A catalog row (DB/CSV shape); override only what a case cares about. */
function catalog(overrides: Partial<CatalogBook> = {}): CatalogBook {
	const base: BookFields = {
		title: 'Heir to the Empire',
		slug: 'heir-to-the-empire',
		author: ['Timothy Zahn'],
		cover_image: 'https://covers.openlibrary.org/x.jpg',
		canon: 'Legends',
		date_published: '1991-05-01',
		format: ['Hardcover'],
		isbn: ['9780553296129'],
		primary_isbn: '9780553296129',
		language: 'English',
		publisher: 'Bantam Spectra',
		series_name: 'The Thrawn Trilogy',
		series_order: null,
		timeline_order: 9,
		synopsis: null,
		type: 'Adult Novel',
		era: null,
	};
	return { id: 'id-1', ...base, ...overrides };
}

describe('normalization helpers', () => {
	it('normalizes titles past punctuation, case, and (novel) suffixes', () => {
		expect(normalizeTitleKey('Darth Bane: Path of Destruction (novel)')).toBe(
			normalizeTitleKey('Darth Bane: Path of Destruction'),
		);
		expect(normalizeTitleKey('Thrawn')).toBe('thrawn');
	});

	it('builds a FULL author surname set', () => {
		expect([...authorSurnameSet(['John Jackson Miller', 'Dave Filoni'])].sort()).toEqual([
			'filoni',
			'miller',
		]);
	});

	it('token-sort ratio is order-insensitive and integer', () => {
		const r = tokenSortRatio('Heir to the Empire', 'Empire the to Heir');
		expect(r).toBe(100);
		expect(Number.isInteger(r)).toBe(true);
	});
});

describe('classify cascade', () => {
	it('MATCHED: identical discovered + catalog row, no wiki-owned diffs', () => {
		const [r] = classify([discovered()], [catalog()]);
		expect(r?.class).toBe('MATCHED');
		expect(r?.method).toBe('isbn');
		expect(r?.matchSlug).toBe('heir-to-the-empire');
		expect(r?.diffs).toHaveLength(0);
	});

	it('ISBN match WITH corroboration matches even when a wiki field differs → DIFFERS', () => {
		// Same ISBN + same title (corroborates); publisher differs → suggestion.
		const [r] = classify([discovered({ publisher: 'Del Rey' })], [catalog()]);
		expect(r?.class).toBe('DIFFERS');
		expect(r?.method).toBe('isbn');
		expect(r?.diffs.map((d) => d.field)).toContain('publisher');
		// Suggestion only — carries both values, nothing auto-applied.
		const pub = r?.diffs.find((d) => d.field === 'publisher');
		expect(pub).toMatchObject({ discovered: 'Del Rey', catalog: 'Bantam Spectra' });
	});

	it('wiki ISBN subset of an enriched catalog array is NOT a diff → MATCHED', () => {
		// Catalog carries the full enriched edition set; wiki has one of them.
		const cat = catalog({ isbn: ['9780553296129', '9780345384003', '9781101888278'] });
		const [r] = classify([discovered({ isbn: ['9780553296129'] })], [cat]);
		expect(r?.class).toBe('MATCHED');
	});

	it('wiki knowing an author the catalog lacks IS an additive diff → DIFFERS', () => {
		const cat = catalog({ author: ['John Jackson Miller'] });
		const disc = discovered({ author: ['Dave Filoni', 'John Jackson Miller'] });
		const [r] = classify([disc], [cat]);
		expect(r?.class).toBe('DIFFERS');
		expect(r?.diffs.map((d) => d.field)).toContain('author');
	});

	it('shared-ISBN omnibus WITHOUT title/author agreement is NOT auto-matched → AMBIGUOUS', () => {
		// An omnibus reuses one edition's ISBN but has a different title + authors.
		const omnibus = catalog({
			slug: 'the-thrawn-trilogy-omnibus',
			title: 'The Thrawn Trilogy Omnibus',
			author: ['Various Authors'],
			isbn: ['9780553296129'], // same ISBN as the discovered single
		});
		const [r] = classify([discovered()], [omnibus]);
		expect(r?.class).toBe('AMBIGUOUS');
		expect(r?.method).toBe('isbn');
		expect(r?.matchSlug).toBeNull();
		expect(r?.candidates).toEqual(['the-thrawn-trilogy-omnibus']);
	});

	it('Canon vs Legends twins (same title+author) classify distinctly, never cross-match', () => {
		// Discovered Legends row; catalog holds only the Canon twin → no match → NEW.
		const canonTwin = catalog({ slug: 'solo', title: 'Solo', canon: 'Canon', isbn: [] });
		const disc = discovered({
			title: 'Solo',
			slug: 'solo',
			canon: 'Legends',
			isbn: [],
			author: ['A. C. Crispin'],
		});
		const [r] = classify([disc], [canonTwin]);
		expect(r?.class).toBe('NEW');
		// Canon twin already holds the clean slug in the catalog → Legends twin
		// gets `-legends`, never cross-matched onto the Canon row.
		expect(r?.proposedSlug).toBe('solo-legends');
	});

	it('title + FULL author set + canon matches when no ISBN is present', () => {
		const disc = discovered({ isbn: [], primary_isbn: null });
		const cat = catalog({ isbn: [] });
		const [r] = classify([disc], [cat]);
		expect(r?.class).toBe('MATCHED');
		expect(r?.method).toBe('title-author');
	});

	it('differing co-author set blocks a lone-surname title match (full set compared)', () => {
		const disc = discovered({
			title: 'Dark Disciple',
			slug: 'dark-disciple',
			isbn: [],
			author: ['Christie Golden', 'Katie Lucas'],
		});
		// Catalog has only one of the two authors → full-set inequality → not matched.
		const cat = catalog({
			slug: 'dark-disciple',
			title: 'Dark Disciple',
			isbn: [],
			author: ['Christie Golden'],
		});
		const [r] = classify([disc], [cat]);
		expect(r?.class).not.toBe('MATCHED');
		expect(r?.class).not.toBe('DIFFERS');
	});

	it('fuzzy title is review-only (AMBIGUOUS), never an automatic match', () => {
		// Near-identical titles, different ISBN + author surnames so steps 1–2 miss.
		const disc = discovered({
			title: 'Heir to the Empiree',
			slug: 'heir-to-the-empiree',
			isbn: [],
			author: ['Someone Else'],
		});
		const cat = catalog({ isbn: [], author: ['Timothy Zahn'] });
		expect(tokenSortRatio(disc.title, cat.title)).toBeGreaterThanOrEqual(FUZZY_THRESHOLD);
		const [r] = classify([disc], [cat]);
		expect(r?.class).toBe('AMBIGUOUS');
		expect(r?.method).toBe('fuzzy');
	});

	it('NEW when nothing matches, with a slugified proposed slug', () => {
		const disc = discovered({
			title: 'A Brand New Novel',
			slug: 'a-brand-new-novel',
			isbn: [],
			author: ['New Author'],
		});
		const [r] = classify([disc], [catalog()]);
		expect(r?.class).toBe('NEW');
		expect(r?.proposedSlug).toBe('a-brand-new-novel');
	});
});

describe('NEW slug -legends tiebreaker', () => {
	// A Canon novel and its Legends twin, both absent from the catalog, collide on
	// the same base slug. Lower source_pageid keeps the clean slug; the Legends
	// twin gets `-legends`. Must be stable regardless of input array order.
	const canonNew = discovered({
		title: 'Dark Empire',
		slug: 'dark-empire',
		canon: 'Canon',
		isbn: [],
		author: ['Canon Author'],
		source_pageid: 100,
	});
	const legendsNew = discovered({
		title: 'Dark Empire',
		slug: 'dark-empire',
		canon: 'Legends',
		isbn: [],
		author: ['Legends Author'],
		source_pageid: 200,
	});

	it('lower-pageid Canon keeps the clean slug; Legends twin gets -legends', () => {
		const res = classify([canonNew, legendsNew], []);
		const canonR = res.find((r) => r.discovered.canon === 'Canon');
		const legendsR = res.find((r) => r.discovered.canon === 'Legends');
		expect(canonR?.proposedSlug).toBe('dark-empire');
		expect(legendsR?.proposedSlug).toBe('dark-empire-legends');
	});

	it('is stable when the input order is reversed', () => {
		const res = classify([legendsNew, canonNew], []);
		const canonR = res.find((r) => r.discovered.canon === 'Canon');
		const legendsR = res.find((r) => r.discovered.canon === 'Legends');
		expect(canonR?.proposedSlug).toBe('dark-empire');
		expect(legendsR?.proposedSlug).toBe('dark-empire-legends');
	});

	it('avoids colliding with an existing catalog slug', () => {
		const disc = discovered({
			title: 'Dark Empire',
			slug: 'dark-empire',
			canon: 'Canon',
			isbn: [],
			author: ['Canon Author'],
		});
		const existing = catalog({ slug: 'dark-empire', title: 'Different Book', canon: 'Canon' });
		const [r] = classify([disc], [existing]);
		// Existing Canon row shares the slug but is a different book (different
		// title/author, no shared ISBN) → NEW with a de-duped slug.
		expect(r?.class).toBe('NEW');
		expect(r?.proposedSlug).toBe('dark-empire-2');
	});
});

describe('unmatchedCatalog', () => {
	it('reports catalog rows not resolved by any discovered row', () => {
		const inDiscovery = catalog();
		const notInDiscovery = catalog({ slug: 'lost-stars', title: 'Lost Stars', isbn: [] });
		const results = classify([discovered()], [inDiscovery, notInDiscovery]);
		const leftover = unmatchedCatalog(results, [inDiscovery, notInDiscovery]);
		expect(leftover.map((c) => c.slug)).toEqual(['lost-stars']);
	});
});
