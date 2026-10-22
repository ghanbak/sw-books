import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAppearancesWikitext } from './appearances';
import { type Appearances, parseAppearances } from './enrichment';
import {
	buildCharacterRows,
	castPreview,
	characterAccessibilityLabel,
	characterItems,
	formatAttributionLine,
	formatLicense,
	formatRole,
	matchesCharacter,
	normalizeSearch,
	parseTimeline,
	timelineAccessibilityLabel,
} from './enrichment-display';

function starByStar(): Appearances {
	const wikitext = readFileSync(
		resolve(__dirname, '__fixtures__', 'njo-star-by-star.wiki'),
		'utf-8',
	);
	return parseAppearances(
		JSON.parse(JSON.stringify(parseAppearancesWikitext(wikitext).appearances)),
	);
}

function apps(partial: Record<string, unknown>): Appearances {
	return parseAppearances(partial);
}

describe('parseTimeline', () => {
	it('returns no segments for empty notes', () => {
		expect(parseTimeline(null)).toEqual([]);
		expect(parseTimeline('')).toEqual([]);
		expect(parseTimeline(' ; ')).toEqual([]);
	});

	it('keeps a single segment whole', () => {
		expect(parseTimeline('27 ABY')).toEqual([{ range: '27 ABY', label: null }]);
		expect(parseTimeline('c. 15 BBY–c. 2 BBY')).toEqual([
			{ range: 'c. 15 BBY–c. 2 BBY', label: null },
		]);
	});

	it('splits multi-part timelines, labels the trailing group, en-dashes number ranges', () => {
		expect(parseTimeline('67-65 BBY (Part 1); 54-52 BBY (part 2); 34-32 BBY (Part 3)')).toEqual([
			{ range: '67–65 BBY', label: 'Part 1' },
			{ range: '54–52 BBY', label: 'Part 2' },
			{ range: '34–32 BBY', label: 'Part 3' },
		]);
	});

	it('does not split on semicolons inside parentheses', () => {
		expect(parseTimeline('25 ABY (Part 1; prologue); 26 ABY')).toEqual([
			{ range: '25 ABY', label: 'Part 1; prologue' },
			{ range: '26 ABY', label: null },
		]);
	});

	it('keeps a group that is the whole segment as the range', () => {
		expect(parseTimeline('(unknown)')).toEqual([{ range: '(unknown)', label: null }]);
	});

	it('only labels a trailing group, not one mid-segment', () => {
		expect(parseTimeline('19 BBY (Order 66) - 18 BBY')).toEqual([
			{ range: '19 BBY (Order 66) - 18 BBY', label: null },
		]);
	});

	it('en-dashes after an era suffix too', () => {
		expect(parseTimeline('19 BBY - 0 BBY')).toEqual([{ range: '19 BBY–0 BBY', label: null }]);
	});
});

describe('timelineAccessibilityLabel', () => {
	it('speaks ranges and labels', () => {
		expect(
			timelineAccessibilityLabel(parseTimeline('67-65 BBY (Part 1); c. 15 BBY–c. 2 BBY')),
		).toBe('67 to 65 BBY, Part 1; circa 15 BBY to circa 2 BBY');
	});
});

describe('formatRole / formatLicense / formatAttributionLine', () => {
	it('capitalizes the first letter only', () => {
		expect(formatRole('chief of state (male Bothan)')).toBe('Chief of state (male Bothan)');
		expect(formatRole("Jedi Knight (female Twi'lek)")).toBe("Jedi Knight (female Twi'lek)");
		expect(formatRole(null)).toBeNull();
	});

	it('formats CC licenses and passes unknown ones through', () => {
		expect(formatLicense('CC-BY-SA-3.0')).toBe('CC BY-SA 3.0');
		expect(formatLicense('CC-BY-4.0')).toBe('CC BY 4.0');
		expect(formatLicense('Public domain')).toBe('Public domain');
	});

	it('builds the attribution line with a default attribution', () => {
		expect(formatAttributionLine('Wookieepedia contributors', 'CC-BY-SA-3.0')).toBe(
			'From Wookieepedia contributors · CC BY-SA 3.0',
		);
		expect(formatAttributionLine(null, 'CC-BY-SA-3.0')).toBe(
			'From Wookieepedia contributors · CC BY-SA 3.0',
		);
	});
});

describe('characterItems', () => {
	it('formats cast roles, keeps other notes verbatim, flags mention-only', () => {
		const { cast, other } = characterItems(
			apps({
				dramatis_personae: [
					{ name: "Borsk Fey'lya", page: "Borsk Fey'lya", note: 'chief of state (male Bothan)' },
				],
				characters: [
					{ name: 'Gial Ackbar', page: 'Gial Ackbar', markers: ['mentioned'] },
					{ name: 'Tam Azur-Jamin', page: 'Tam Azur-Jamin', note: '"quiet"' },
					{ name: 'Daye', markers: ['first_mentioned'] },
					{ name: 'Seef', markers: ['hologram'] },
				],
			}),
		);
		expect(cast).toEqual([
			{
				key: 'cast:0',
				name: "Borsk Fey'lya",
				note: 'Chief of state (male Bothan)',
				page: "Borsk Fey'lya",
				mentioned: false,
			},
		]);
		expect(other.map((o) => [o.name, o.note, o.mentioned])).toEqual([
			['Gial Ackbar', null, true],
			['Tam Azur-Jamin', '"quiet"', false],
			['Daye', null, true],
			['Seef', null, false],
		]);
	});

	it('dedupes other characters against the cast by page, else name', () => {
		const { other } = characterItems(
			apps({
				dramatis_personae: [{ name: 'Han Solo', page: 'Han Solo/Legends' }, { name: 'Tekli' }],
				characters: [
					{ name: 'Han', page: 'Han Solo/Legends' },
					{ name: 'Tekli' },
					{ name: 'Wedge Antilles', page: 'Wedge Antilles/Legends' },
				],
			}),
		);
		expect(other.map((o) => o.name)).toEqual(['Wedge Antilles']);
		expect(other[0]?.key).toBe('other:2');
	});
});

describe('search', () => {
	it('normalizes case and diacritics', () => {
		expect(normalizeSearch('  Padmé ')).toBe('padme');
		const item = { key: 'k', name: 'Padmé Amidala', note: null, page: null, mentioned: false };
		expect(matchesCharacter(item, 'PADME')).toBe(true);
		expect(matchesCharacter(item, 'amidala')).toBe(true);
		expect(matchesCharacter(item, 'leia')).toBe(false);
		expect(matchesCharacter(item, '   ')).toBe(true);
	});

	it('matches on the note (alias)', () => {
		const item = {
			key: 'k',
			name: "Mitth'raw'nuruodo",
			note: '"Thrawn"',
			page: null,
			mentioned: true,
		};
		expect(matchesCharacter(item, 'thrawn')).toBe(true);
	});
});

describe('buildCharacterRows (Star by Star)', () => {
	const appearances = starByStar();

	it('lists main cast then other characters with headers, ends and a gap', () => {
		const { rows, total, castCount, otherCount } = buildCharacterRows(appearances, '');
		expect(total).toBe(135);
		expect(castCount).toBe(32);
		expect(otherCount).toBe(103);
		expect(rows).toHaveLength(32 + 103 + 2 * 2 + 1);
		expect(rows[0]).toEqual({
			type: 'header',
			key: 'header:cast',
			section: 'cast',
			title: 'Main cast',
			count: 32,
		});
		expect(rows[1]?.type === 'entry' && rows[1].item.name).toBe('Alema Rar');
		expect(rows[33]).toEqual({ type: 'section-end', key: 'end:cast', section: 'cast' });
		expect(rows[34]).toEqual({ type: 'gap', key: 'gap:other' });
		expect(rows[35]).toMatchObject({ type: 'header', title: 'Other characters', count: 103 });
		expect(rows.at(-1)).toEqual({ type: 'section-end', key: 'end:other', section: 'other' });
		const keys = rows.map((r) => r.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('counts 35 mention-only other characters', () => {
		const { rows } = buildCharacterRows(appearances, '');
		const mentioned = rows.filter(
			(r) => r.type === 'entry' && r.section === 'other' && r.item.mentioned,
		);
		expect(mentioned).toHaveLength(35);
	});

	it('finds Thrawn by alias and drops sections without hits', () => {
		const { rows, total, castCount, otherCount } = buildCharacterRows(appearances, 'thrawn');
		expect(total).toBe(135);
		expect(castCount).toBe(0);
		expect(otherCount).toBe(1);
		expect(rows.map((r) => r.type)).toEqual(['header', 'entry', 'section-end']);
		const entry = rows[1];
		expect(entry?.type === 'entry' && entry.item.name).toBe("Mitth'raw'nuruodo");
		expect(rows[0]).toMatchObject({ section: 'other', count: 1 });
	});

	it('returns no rows when nothing matches', () => {
		const { rows, castCount, otherCount } = buildCharacterRows(appearances, 'zzzz');
		expect(rows).toEqual([]);
		expect(castCount + otherCount).toBe(0);
	});

	it('keeps entry keys stable across searches', () => {
		const all = buildCharacterRows(appearances, '').rows;
		const hit = buildCharacterRows(appearances, 'thrawn').rows[1];
		expect(hit && all.some((r) => r.key === hit.key)).toBe(true);
	});
});

describe('castPreview', () => {
	it('takes the first 5 cast entries and reports more', () => {
		const { items, hasMore } = castPreview(starByStar());
		expect(items.map((i) => i.name)).toEqual([
			'Alema Rar',
			'Anakin Solo',
			'Bela Hara',
			"Borsk Fey'lya",
			'C-3PO',
		]);
		expect(hasMore).toBe(true);
	});

	it('reports no more when the cast fits and there are no others', () => {
		const { items, hasMore } = castPreview(
			apps({ dramatis_personae: [{ name: 'A' }, { name: 'B' }] }),
		);
		expect(items).toHaveLength(2);
		expect(hasMore).toBe(false);
	});

	it('reports more when only other characters remain', () => {
		expect(
			castPreview(apps({ dramatis_personae: [{ name: 'A' }], characters: [{ name: 'B' }] }))
				.hasMore,
		).toBe(true);
	});
});

describe('characterAccessibilityLabel', () => {
	it('reads mention-only and note', () => {
		expect(
			characterAccessibilityLabel({ name: 'Chewbacca', note: '"Chewie"', mentioned: true }),
		).toBe('Chewbacca, mentioned only, "Chewie"');
		expect(
			characterAccessibilityLabel({
				name: 'Anakin Solo',
				note: 'Jedi Knight (male Human)',
				mentioned: false,
			}),
		).toBe('Anakin Solo, Jedi Knight (male Human)');
		expect(characterAccessibilityLabel({ name: 'Seef', note: null, mentioned: false })).toBe(
			'Seef',
		);
	});
});
