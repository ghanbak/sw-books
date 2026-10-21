import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTimelineNotes, parseAppearancesWikitext, parsePageEnrichment } from './appearances';
import { APPEARANCE_CATEGORIES, isMentionOnly, parseAppearances } from './enrichment';

// Real wikitext from starwars.fandom.com (CC BY-SA 3.0, Wookieepedia contributors),
// pinned at these revisions:
//   canon-a-new-dawn.wiki             "A New Dawn (novel)"                pageid 450166 rev 15761656
//   legends-heir-to-the-empire.wiki   "Heir to the Empire"                pageid 759    rev 15758981
//   njo-star-by-star.wiki             "The New Jedi Order: Star by Star"  pageid 2798   rev 15663543
function fixture(name: string): string {
	return readFileSync(resolve(__dirname, '__fixtures__', `${name}.wiki`), 'utf-8');
}

function counts(wikitext: string): Record<string, number> {
	const { appearances } = parseAppearancesWikitext(wikitext);
	return Object.fromEntries(Object.entries(appearances).map(([k, v]) => [k, v?.length ?? 0]));
}

describe('parsePageEnrichment — canon (A New Dawn)', () => {
	const page = parsePageEnrichment(fixture('canon-a-new-dawn'));

	it('reads every category with no drift', () => {
		expect(counts(fixture('canon-a-new-dawn'))).toEqual({
			characters: 37,
			organisms: 13,
			droids: 11,
			events: 10,
			locations: 57,
			organizations: 82,
			species: 18,
			vehicles: 49,
			technology: 57,
			miscellanea: 142,
		});
		expect(page.entryCount).toBe(476);
		expect(page.diagnostics).toEqual({
			appTemplates: 1,
			unknownParams: [],
			unknownTemplates: {},
			subheadings: 0,
			skippedLines: 0,
			emptyEntries: 0,
		});
		expect(page.timeline_notes).toBe('11 BBY');
		expect(page.hasBookInfobox).toBe(true);
	});

	it('keeps the {{1stID|x}} argument as the note, deduped against the trailing alias', () => {
		expect(page.appearances.characters).toContainEqual({
			name: 'Kanan Jarrus',
			page: 'Kanan Jarrus',
			markers: ['first_identified'],
			note: 'Caleb Dume',
		});
	});

	it('tracks deep location nesting and sets page even when it equals the name', () => {
		const locs = page.appearances.locations ?? [];
		expect(locs.slice(6, 12)).toEqual([
			{ name: 'Coruscant subsector', page: 'Coruscant subsector', depth: 2 },
			{ name: 'Coruscant system', page: 'Coruscant system', depth: 3 },
			{ name: 'Coruscant', page: 'Coruscant', depth: 4 },
			{ name: 'Galactic City', page: 'Imperial City', depth: 5 },
			{ name: 'Federal District', page: 'Federal District', depth: 6 },
			{ name: 'Jedi Temple', page: 'Imperial Palace', depth: 7 },
		]);
	});
});

describe('parsePageEnrichment — Legends (Heir to the Empire)', () => {
	const page = parsePageEnrichment(fixture('legends-heir-to-the-empire'));
	const chars = page.appearances.characters ?? [];

	it('ignores the {{!}} column break and reads all 64 characters', () => {
		expect(chars).toHaveLength(64);
		expect(chars.some((e) => e.name.includes('{{') || e.name === '')).toBe(false);
		expect(page.diagnostics.unknownTemplates).toEqual({});
	});

	it('maps markers, aliases, comments and template arguments', () => {
		expect(chars).toContainEqual({
			name: "Mitth'raw'nuruodo",
			page: "Mitth'raw'nuruodo/Legends",
			markers: ['first'],
			note: '"Thrawn"',
		});
		expect(chars).toContainEqual({
			name: 'Obi-Wan Kenobi',
			page: 'Obi-Wan Kenobi/Legends',
			markers: ['vision'],
			note: '"Ben"; Luke Skywalker',
		});
		expect(chars).toContainEqual({
			name: 'Mara Jade',
			page: 'Mara Jade Skywalker',
			markers: ['first'],
			note: 'Senni Kiffu',
		});
		expect(chars).toContainEqual({
			name: 'Jacen Solo',
			page: 'Darth Caedus',
			markers: ['first'],
			note: 'unborn',
		});
		expect(chars).toContainEqual({
			name: 'Brandei',
			page: 'Brandei',
			note: 'First appearance before retcon',
		});
		expect(chars).toContainEqual({
			name: 'Bail Prestor Organa',
			page: 'Bail Prestor Organa/Legends',
			markers: ['indirect_mention'],
		});
	});

	it('keeps multiple markers in order and nesting under a parent event', () => {
		const events = page.appearances.events ?? [];
		expect(events).toContainEqual({
			name: 'Kaleesh–Imperial conflict',
			page: 'Kaleesh–Imperial conflict',
			markers: ['first_mentioned', 'retcon'],
		});
		expect(events).toContainEqual({
			name: 'Battle of Endor',
			page: 'Battle of Endor/Legends',
			markers: ['mentioned'],
			depth: 1,
		});
		expect(events).toContainEqual({
			name: 'Attack on Bpfassh',
			page: 'Attack on Bpfassh',
			markers: ['first'],
			depth: 2,
		});
	});

	it('reads the infobox timeline through a piped link', () => {
		expect(page.timeline_notes).toBe('9 ABY');
	});
});

describe('parsePageEnrichment — NJO dramatis personae (Star by Star)', () => {
	const page = parsePageEnrichment(fixture('njo-star-by-star'));

	it('keeps the main cast separate and folds other characters into characters', () => {
		expect(page.appearances.dramatis_personae).toHaveLength(32);
		expect(page.appearances.characters).toHaveLength(103);
		expect(page.entryCount).toBe(884);
		expect(page.diagnostics.unknownParams).toEqual([]);
	});

	it('stores the role (with alias) as the note', () => {
		const dp = page.appearances.dramatis_personae ?? [];
		expect(dp[0]).toEqual({
			name: 'Alema Rar',
			page: 'Alema Rar',
			markers: ['first'],
			note: "Jedi Knight (female Twi'lek)",
		});
		expect(dp).toContainEqual({
			name: 'Han Solo',
			page: 'Han Solo/Legends',
			note: 'captain, Millennium Falcon (male Human) / Miek',
		});
		expect(page.appearances.characters?.[0]).toEqual({
			name: 'Gial Ackbar',
			page: 'Gial Ackbar/Legends',
			markers: ['mentioned'],
		});
	});
});

describe('stored shape round-trips through parseAppearances', () => {
	it.each(['canon-a-new-dawn', 'legends-heir-to-the-empire', 'njo-star-by-star'])(
		'%s: jsonb → parseAppearances keeps every entry',
		(name) => {
			const { appearances, entryCount } = parseAppearancesWikitext(fixture(name));
			const back = parseAppearances(JSON.parse(JSON.stringify(appearances)));
			expect(APPEARANCE_CATEGORIES.reduce((n, c) => n + back[c].length, 0)).toBe(entryCount);
			for (const c of APPEARANCE_CATEGORIES) {
				const stored = appearances[c] ?? [];
				back[c].forEach((e, i) => {
					const s = stored[i];
					expect(e).toEqual({
						name: s?.name,
						page: s?.page ?? null,
						markers: s?.markers ?? [],
						note: s?.note ?? null,
						depth: s?.depth ?? 0,
					});
				});
			}
		},
	);

	it('emits categories in display order and omits empty ones', () => {
		const { appearances } = parseAppearancesWikitext(fixture('njo-star-by-star'));
		expect(Object.keys(appearances)).toEqual(APPEARANCE_CATEGORIES.slice());
		const heir = parseAppearancesWikitext(fixture('legends-heir-to-the-empire')).appearances;
		expect('dramatis_personae' in heir).toBe(false);
	});

	it('flags mention-only entries through the narrowed type', () => {
		const back = parseAppearances(
			parseAppearancesWikitext(fixture('legends-heir-to-the-empire')).appearances,
		);
		const boba = back.characters.find((e) => e.name === 'Boba Fett');
		expect(boba && isMentionOnly(boba)).toBe(true);
	});
});

describe('parseAppearancesWikitext — edge cases', () => {
	const app = (body: string) => parseAppearancesWikitext(`==Appearances==\n{{App\n${body}\n}}`);

	it('folds c-/l- crossover params into their base key, in order', () => {
		const r = app(
			'|c-characters=\n*[[Luke Skywalker]]\n|l-characters=\n*[[Luke Skywalker/Legends|Luke Skywalker]]\n|l-droids=\n*[[R2-D2/Legends|R2-D2]]',
		);
		expect(r.appearances.characters).toEqual([
			{ name: 'Luke Skywalker', page: 'Luke Skywalker' },
			{ name: 'Luke Skywalker', page: 'Luke Skywalker/Legends' },
		]);
		expect(r.appearances.droids).toEqual([{ name: 'R2-D2', page: 'R2-D2/Legends' }]);
	});

	it('always sets page for a linked entry (normalized), never for plain text', () => {
		const r = app('|characters=\n*[[Yoda]]\n*[[luke_Skywalker|Luke]]\n*Unidentified pilot');
		expect(r.appearances.characters).toEqual([
			{ name: 'Yoda', page: 'Yoda' },
			{ name: 'Luke', page: 'Luke Skywalker' },
			{ name: 'Unidentified pilot' },
		]);
		// Rows written before this rule (no page on a same-name link) still parse.
		expect(parseAppearances({ characters: [{ name: 'Yoda' }] }).characters[0]?.page).toBeNull();
	});

	it('keeps plain-text entries without a page and treats a possessive link as plain text', () => {
		const r = app("|characters=\n*Unidentified smuggler {{1st}}\n*[[Jabba]]'s majordomo {{Mo}}");
		expect(r.appearances.characters).toEqual([
			{ name: 'Unidentified smuggler', markers: ['first'] },
			{ name: "Jabba's majordomo", markers: ['mentioned'] },
		]);
	});

	it("keeps quoted phrases, italic vessel names, link trails and {{'s}}", () => {
		const r = app(
			"|vehicles=\n*''[[Millennium Falcon/Legends|Millennium Falcon]]''\n*[[Star Destroyer]]s\n|miscellanea=\n*\"[[Clanker]]\" {{1st}}\n*[[Han Solo]]{{'s}} dice {{C|as an [[heirloom]]}}",
		);
		expect(r.appearances.vehicles).toEqual([
			{ name: 'Millennium Falcon', page: 'Millennium Falcon/Legends' },
			{ name: 'Star Destroyers', page: 'Star Destroyer' },
		]);
		expect(r.appearances.miscellanea).toEqual([
			{ name: '"Clanker"', page: 'Clanker', markers: ['first'] },
			{ name: "Han Solo's dice", note: 'as an heirloom' },
		]);
	});

	it('tolerates unknown markers, unknown params, inline {{!}}, comments and refs', () => {
		const r = app(
			"|characters=\n*[[Yoda]] {{Newmarker|x}} {{Mo}}<!-- note -->{{!}}\n*[[Ahsoka Tano]]<ref>{{Cite|a}}</ref>\n|beasts=\n*[[Rancor]]\n|droids=\n'''Heading'''\n<div style=\"float:left\">\n*[[BB-8]]\n[[R5-D4]] {{1st}}",
		);
		expect(r.appearances.characters).toEqual([
			{ name: 'Yoda', page: 'Yoda', markers: ['mentioned'] },
			{ name: 'Ahsoka Tano', page: 'Ahsoka Tano' },
		]);
		expect(r.appearances.droids).toEqual([{ name: 'BB-8', page: 'BB-8' }]);
		expect(r.diagnostics.unknownTemplates).toEqual({ newmarker: 1 });
		expect(r.diagnostics.unknownParams).toEqual(['beasts']);
		expect(r.diagnostics.subheadings).toBe(2);
		expect(r.diagnostics.skippedLines).toBe(1); // the unbulleted R5-D4 line
	});

	it('drops publication arguments of first-appearance markers but keeps {{ID|x}}', () => {
		const r = app('|characters=\n*[[Rex]] {{1st|"[[Scorched]]"}}\n*[[Cad Bane]] {{ID|Yagai}}');
		expect(r.appearances.characters).toEqual([
			{ name: 'Rex', page: 'Rex', markers: ['first'] },
			{ name: 'Cad Bane', page: 'Cad Bane', markers: ['identified_as'], note: 'Yagai' },
		]);
	});

	it('maps the markers found in the full-catalog sync', () => {
		const r = app(
			'|characters=\n*[[A]] {{Ho}}\n*[[B]] {{Corpse}}\n*[[C]] {{Unborn}}\n*[[D]] {{Sim}}\n*[[E]] {{Holocron}}\n*[[F]] {{Qo}}\n*[[G]] {{1stp|x}}\n*[[H]] {{1stdesc}}\n*[[I]] {{1stcm}}\n*[[J]] {{Crawl}}\n*[[K]] {{C|in {{StoryCite|book=X|story=Y}}}}',
		);
		expect(r.appearances.characters?.map((e) => [e.name, e.markers ?? [], e.note ?? null])).toEqual(
			[
				['A', ['heard'], null],
				['B', ['corpse'], null],
				['C', ['unborn'], null],
				['D', ['simulation'], null],
				['E', ['holocron'], null],
				['F', ['quote'], null],
				['G', ['first_pictured'], null],
				['H', ['first_described'], null],
				['I', ['first_canon_mentioned'], null],
				['J', ['mentioned'], 'opening crawl'],
				['K', [], 'in'],
			],
		);
		expect(r.diagnostics.unknownTemplates).toEqual({});
		const back = parseAppearances(r.appearances);
		expect(back.characters.map((e) => e.markers.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
		expect(isMentionOnly(back.characters[8] as (typeof back.characters)[number])).toBe(true);
	});

	it('returns an empty payload when the page has no {{App}}', () => {
		const r = parseAppearancesWikitext('{{IncompleteApp}}\nNo appearances here.');
		expect(r).toMatchObject({ appearances: {}, entryCount: 0 });
		expect(r.diagnostics.appTemplates).toBe(0);
	});
});

describe('buildTimelineNotes', () => {
	it('keeps {{C|…}} labels and joins <br> segments (Darth Plagueis)', () => {
		expect(
			buildTimelineNotes(
				'[[67 BBY/Legends|67]]-[[65 BBY/Legends|65 BBY]] {{C|Part 1}}<ref name="TERC">\'\'[[The Essential Reader\'s Companion]]\'\'</ref><br />[[54 BBY/Legends|54]]-[[52 BBY/Legends|52 BBY]] {{C|Part 2}}<ref name="TERC" /><br />[[34 BBY/Legends|34]]-[[32 BBY/Legends|32 BBY]] {{C|Part 3}}<ref name="TERC" />',
			),
		).toBe('67-65 BBY (Part 1); 54-52 BBY (Part 2); 34-32 BBY (Part 3)');
	});

	it('drops refs with nested templates and decodes dashes (Thrawn)', () => {
		expect(
			buildTimelineNotes(
				'c. [[15 BBY]]<ref name="Beginning Date">{{ThrawnNovelStartDate}}</ref>&ndash;c. [[2 BBY]]<ref name="End Date">{{ThrawnNovelEndDate}}</ref>',
			),
		).toBe('c. 15 BBY–c. 2 BBY');
	});

	it('returns null for an empty or absent value', () => {
		expect(buildTimelineNotes(undefined)).toBeNull();
		expect(buildTimelineNotes('<ref name="x" />')).toBeNull();
	});
});
