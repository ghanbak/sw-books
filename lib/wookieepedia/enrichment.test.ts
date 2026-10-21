import { describe, expect, it } from 'vitest';
import type { Tables } from '../types';
import {
	APPEARANCE_CATEGORIES,
	type BookEnrichmentRow,
	isMentionOnly,
	parseAppearances,
	parseEnrichment,
} from './enrichment';

// Compile-time guard (tsc): the generated row must stay assignable to the parser input.
type GeneratedRowFits = Tables<'book_enrichment'> extends BookEnrichmentRow ? true : never;
const generatedRowFits: GeneratedRowFits = true;

it('accepts the generated book_enrichment row type', () => {
	expect(generatedRowFits).toBe(true);
});

function row(overrides: Partial<BookEnrichmentRow> = {}): BookEnrichmentRow {
	return {
		book_id: '11111111-1111-1111-1111-111111111111',
		source_pageid: 759,
		source_title: 'Heir to the Empire',
		source_url: 'https://starwars.fandom.com/wiki/Heir_to_the_Empire',
		source_revision_id: 15758981,
		license: 'CC-BY-SA-3.0',
		attribution: 'Wookieepedia contributors',
		fetched_at: '2026-10-20T00:00:00Z',
		timeline_notes: '9 ABY',
		appearances: {},
		...overrides,
	};
}

describe('parseEnrichment', () => {
	it('passes provenance through and narrows a well-formed payload', () => {
		const e = parseEnrichment(
			row({
				appearances: {
					characters: [
						{ name: 'Thrawn', page: "Mitth'raw'nuruodo/Legends", markers: ['first'] },
						{ name: 'Boba Fett', page: 'Boba Fett/Legends', markers: ['mentioned'] },
						{ name: 'Palpatine', markers: ['vision'], note: 'Mara Jade' },
					],
					events: [
						{ name: 'Galactic Civil War' },
						{ name: 'Battle of Endor', markers: ['mentioned'], depth: 1 },
					],
				},
			}),
		);
		expect(e.source_pageid).toBe(759);
		expect(e.source_url).toBe('https://starwars.fandom.com/wiki/Heir_to_the_Empire');
		expect(e.license).toBe('CC-BY-SA-3.0');
		expect(e.timeline_notes).toBe('9 ABY');
		expect(e.appearances.characters).toEqual([
			{
				name: 'Thrawn',
				page: "Mitth'raw'nuruodo/Legends",
				markers: ['first'],
				note: null,
				depth: 0,
			},
			{
				name: 'Boba Fett',
				page: 'Boba Fett/Legends',
				markers: ['mentioned'],
				note: null,
				depth: 0,
			},
			{ name: 'Palpatine', page: null, markers: ['vision'], note: 'Mara Jade', depth: 0 },
		]);
		expect(e.appearances.events[1]).toEqual({
			name: 'Battle of Endor',
			page: null,
			markers: ['mentioned'],
			note: null,
			depth: 1,
		});
	});

	it('fills every category with [] when missing', () => {
		const e = parseEnrichment(row({ appearances: { droids: [{ name: 'R2-D2' }] } }));
		expect(Object.keys(e.appearances).sort()).toEqual([...APPEARANCE_CATEGORIES].sort());
		expect(e.appearances.characters).toEqual([]);
		expect(e.appearances.droids).toHaveLength(1);
	});

	it.each([
		['null', null],
		['an array', []],
		['a string', '{"characters":[]}'],
		['a number', 42],
	])('treats appearances that is %s as empty', (_label, appearances) => {
		const e = parseEnrichment(row({ appearances }));
		for (const c of APPEARANCE_CATEGORIES) expect(e.appearances[c]).toEqual([]);
	});

	it('ignores unknown categories and non-array category values', () => {
		const e = parseEnrichment(
			row({
				appearances: {
					'other characters': [{ name: 'Adarakh' }],
					starships: [{ name: 'Chimaera' }],
					characters: { name: 'not an array' },
				},
			}),
		);
		expect(e.appearances.characters).toEqual([]);
		expect(e.appearances).not.toHaveProperty('starships');
		expect(e.appearances).not.toHaveProperty('other characters');
	});

	it('skips malformed entries without throwing', () => {
		const e = parseEnrichment(
			row({
				appearances: {
					characters: [
						null,
						7,
						[],
						{},
						{ name: '' },
						{ name: '   ' },
						{ name: 42 },
						{ page: 'Luke Skywalker' },
						{ name: 'Luke Skywalker' },
					],
				},
			}),
		);
		expect(e.appearances.characters.map((c) => c.name)).toEqual(['Luke Skywalker']);
	});

	it('accepts a bare string as a name-only entry', () => {
		const e = parseEnrichment(row({ appearances: { species: [' Chiss ', ''] } }));
		expect(e.appearances.species).toEqual([
			{ name: 'Chiss', page: null, markers: [], note: null, depth: 0 },
		]);
	});

	it('drops unknown and duplicate markers, keeps order', () => {
		const e = parseEnrichment(
			row({
				appearances: {
					characters: [
						{ name: 'Rukh', markers: ['first', 'bogus', 3, 'flashback', 'first'] },
						{ name: 'Aves', markers: 'first' },
					],
				},
			}),
		);
		expect(e.appearances.characters[0]?.markers).toEqual(['first', 'flashback']);
		expect(e.appearances.characters[1]?.markers).toEqual([]);
	});

	it('coerces bad depth, page, and note fields to defaults', () => {
		const e = parseEnrichment(
			row({
				appearances: {
					locations: [
						{ name: 'Wayland', depth: -1, page: '', note: 7 },
						{ name: 'Mount Tantiss', depth: 1.5, page: 12, note: '  ' },
						{ name: 'Myrkr', depth: '2' },
					],
				},
			}),
		);
		for (const loc of e.appearances.locations) {
			expect(loc.depth).toBe(0);
			expect(loc.page).toBeNull();
			expect(loc.note).toBeNull();
		}
	});

	it('normalizes a blank timeline_notes to null', () => {
		expect(parseEnrichment(row({ timeline_notes: '  ' })).timeline_notes).toBeNull();
		expect(parseEnrichment(row({ timeline_notes: null })).timeline_notes).toBeNull();
	});
});

describe('parseAppearances', () => {
	it('returns the same empty shape for undefined', () => {
		const a = parseAppearances(undefined);
		expect(Object.values(a).every((v) => v.length === 0)).toBe(true);
	});
});

describe('isMentionOnly', () => {
	const entry = (markers: Parameters<typeof isMentionOnly>[0]['markers']) => ({
		name: 'x',
		page: null,
		markers,
		note: null,
		depth: 0,
	});

	it('is true for mentioned, indirect, and first-mentioned', () => {
		expect(isMentionOnly(entry(['mentioned']))).toBe(true);
		expect(isMentionOnly(entry(['indirect_mention']))).toBe(true);
		expect(isMentionOnly(entry(['first_mentioned']))).toBe(true);
		expect(isMentionOnly(entry(['mentioned', 'flashback']))).toBe(true);
	});

	it('is false for appearances, including non-physical ones', () => {
		expect(isMentionOnly(entry([]))).toBe(false);
		expect(isMentionOnly(entry(['first']))).toBe(false);
		expect(isMentionOnly(entry(['hologram']))).toBe(false);
		expect(isMentionOnly(entry(['first_identified']))).toBe(false);
	});
});
