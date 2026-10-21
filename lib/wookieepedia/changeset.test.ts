import { describe, expect, it } from 'vitest';
import type { AudienceSignal } from '../sources/lookup';
import {
	type BuildInput,
	type InsertLookup,
	type LiveBook,
	buildChangeset,
	dateApprovalKey,
	dateChange,
	findIsbnConflicts,
	normalizePublisher,
	replaceIsbn,
	sameWork,
	unionFormats,
} from './changeset';
import type { DiscoveredBook } from './derive';

function disc(overrides: Partial<DiscoveredBook> = {}): DiscoveredBook {
	return {
		title: 'Heir to the Empire',
		slug: 'heir-to-the-empire',
		author: ['Timothy Zahn'],
		cover_image: 'https://static.wikia.nocookie.net/x.jpg',
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

function live(overrides: Partial<LiveBook> = {}): LiveBook {
	return {
		id: 'id-heir',
		title: 'Heir to the Empire',
		slug: 'heir-to-the-empire',
		author: ['Timothy Zahn'],
		cover_image: 'https://covers.openlibrary.org/b/id/1-L.jpg',
		canon: 'Legends',
		date_published: '1991-05-01',
		format: ['Paperback', 'eBook'],
		isbn: ['9780553296129'],
		primary_isbn: '9780553296129',
		language: 'English',
		publisher: 'Spectra',
		series_name: 'Thrawn',
		series_order: 1,
		timeline_order: 9,
		synopsis: 'Curated one-liner.',
		type: 'Adult Novel',
		era: null,
		...overrides,
	};
}

function input(overrides: Partial<BuildInput> = {}): BuildInput {
	return {
		discovered: [],
		catalog: [],
		excludedTitles: new Map(),
		canceledTitles: new Set(),
		lookups: new Map(),
		datePrecision: new Map(),
		olTitleByIsbn: new Map(),
		olCoverByIsbn: new Map(),
		approvedDateUpdates: new Set(),
		publisherSplits: new Map(),
		typeOverrides: {},
		asOf: '2026-10-20',
		...overrides,
	};
}

const gbFiction: AudienceSignal = {
	source: 'google-books',
	via: 'isbn',
	matchedTitle: 'Tatooine Ghost',
	matchedAuthors: ['Troy Denning'],
	labels: ['Fiction'],
};

describe('pure helpers', () => {
	it('unionFormats is additive, ordered, deduped, and never removes', () => {
		expect(unionFormats(['Paperback', 'eBook'], ['Hardcover', 'Paperback'])).toEqual([
			'Paperback',
			'eBook',
			'Hardcover',
		]);
		expect(unionFormats(['Paperback', 'Audiobook'], [])).toEqual(['Paperback', 'Audiobook']);
		expect(unionFormats(null, ['eBook'])).toEqual(['eBook']);
		// Near-duplicate spellings don't add a second hardcover.
		expect(unionFormats(['Hard Cover'], ['Hardcover'])).toEqual(['Hard Cover']);
	});

	it('dateChange: wiki wins when it differs, compared at the wiki precision', () => {
		expect(dateChange('1994-03-01', '1994-10-01', 'day')).toEqual({
			before: '1994-03-01',
			after: '1994-10-01',
		});
		expect(dateChange(null, '1994-10-01', 'day')).toEqual({ before: null, after: '1994-10-01' });
		expect(dateChange('1994-10-01', '1994-10-01', 'day')).toBeNull();
		expect(dateChange('1994-10-01', null, 'day')).toBeNull(); // never clears a curated value
		// "February 1996" is stored padded (1996-02-01) — a catalog day in Feb 1996 stands.
		expect(dateChange('1996-02-15', '1996-02-01', 'month')).toBeNull();
		expect(dateChange('1996-12-01', '1996-02-01', 'month')?.after).toBe('1996-02-01');
		expect(dateChange('1996-12-01', '1996-01-01', 'year')).toBeNull();
	});

	it('replaceIsbn swaps in place and dedupes', () => {
		expect(replaceIsbn(['A', 'B', 'C'], 'A', 'C')).toEqual(['C', 'B']);
		expect(replaceIsbn(['A', 'B'], 'B', 'D')).toEqual(['A', 'D']);
	});

	it('sameWork tolerates brand/tagline variance but keeps editions distinct', () => {
		expect(sameWork('Star Wars Jedi: Battle Scars', 'Jedi: Battle Scars')).toBe(true);
		expect(sameWork('Shadow Fall: An Alphabet Squadron Novel', 'Shadow Fall')).toBe(true);
		expect(sameWork('Star Wars: The Force Awakens: A Junior Novel', 'The Force Awakens')).toBe(
			false,
		);
		expect(sameWork('Solo: A Star Wars Story: Expanded Edition', 'Solo: A Star Wars Story')).toBe(
			false,
		);
	});
});

describe('updates: only date_published + format', () => {
	it('emits only the date/format columns, never author/publisher/series/isbn', () => {
		const d = disc({
			author: ['Timothy Zahn', 'Someone Else'],
			publisher: 'Del Rey',
			series_name: 'Other',
			timeline_order: 99,
			isbn: ['9780553296129', '9780345384003'], // extra wiki ISBN — must NOT be added
			date_published: '1991-06-01',
			format: ['Hardcover', 'eBook'],
		});
		const cs = buildChangeset(input({ discovered: [d], catalog: [live()] }));
		expect(cs.updates).toHaveLength(1);
		const u = cs.updates[0];
		expect(Object.keys(u?.changes ?? {}).sort()).toEqual(['date_published', 'format']);
		expect(u?.changes.format).toEqual({
			before: ['Paperback', 'eBook'],
			after: ['Paperback', 'eBook', 'Hardcover'],
		});
		expect(u?.changes.date_published).toEqual({ before: '1991-05-01', after: '1991-06-01' });
		expect(u?.id).toBe('id-heir');
		expect(cs.isbn_fixes).toHaveLength(0);
	});

	it('no update when the catalog already holds the wiki facts', () => {
		const cs = buildChangeset(
			input({ discovered: [disc({ format: ['eBook'] })], catalog: [live()] }),
		);
		expect(cs.updates).toHaveLength(0);
	});

	it('an edition variant sharing the base row ISBN never drives the update', () => {
		const base = disc({ date_published: '1991-05-01', format: ['Paperback'] });
		const anniversary = disc({
			title: 'Heir to the Empire: The 20th Anniversary Edition',
			date_published: '2011-09-06',
			isbn: ['9780553296129'],
			source_pageid: 2000,
		});
		const cs = buildChangeset(input({ discovered: [anniversary, base], catalog: [live()] }));
		expect(cs.updates).toHaveLength(0); // base agrees with the catalog; 2011 never lands
		expect(cs.review.map((r) => r.wiki_title)).toContain(
			'Heir to the Empire: The 20th Anniversary Edition',
		);
	});
});

describe('ISBN conflict fixes', () => {
	// Scourge's ISBN sits on Red Harvest AS ITS PRIMARY.
	const redHarvest = live({
		id: 'id-rh',
		slug: 'red-harvest',
		title: 'Red Harvest',
		author: ['Joe Schreiber'],
		isbn: ['9780345511225', '9781448149445', '9780345511171'],
		primary_isbn: '9780345511225',
	});
	const scourge = live({
		id: 'id-sc',
		slug: 'scourge',
		title: 'Scourge',
		author: ['Jeff Grubb'],
		isbn: ['9780345534439'],
		primary_isbn: '9780345534439',
	});
	const wikiScourge = disc({ title: 'Scourge', author: ['Jeff Grubb'], isbn: ['9780345511225'] });
	const wikiRed = disc({
		title: 'Red Harvest',
		author: ['Joe Schreiber'],
		isbn: ['9780345511171'],
	});

	it('replaces the misfiled ISBN with the holder’s own wiki ISBN; primary_isbn follows', () => {
		const { fixes, flagged } = findIsbnConflicts(
			[wikiScourge, wikiRed],
			[redHarvest, scourge],
			new Map(),
		);
		expect(flagged).toEqual([]);
		expect(fixes).toHaveLength(1);
		const f = fixes[0];
		expect(f?.slug).toBe('red-harvest');
		expect(f?.after.isbn).toEqual(['9780345511171', '9781448149445']);
		expect(f?.after.primary_isbn).toBe('9780345511171');
		expect(f?.after.isbn).toContain(f?.after.primary_isbn);
		expect(f?.replacements[0]?.evidence.removed_isbn_owner).toBe('catalog:scourge');
	});

	it('moves an ISBN off its wrong holder and onto the row the wiki gives it to', () => {
		// Champions holds Rogue Squadron's ISBN; Rogue Squadron holds Bacta War's.
		const champions = live({
			id: 'id-ch',
			slug: 'jedi-academy-champions-of-the-force',
			title: 'Champions of the Force',
			author: ['Kevin J. Anderson'],
			isbn: ['9780553568011', '9780553298024'],
			primary_isbn: '9780553298024',
		});
		const rogue = live({
			id: 'id-rs',
			slug: 'x-wing-rogue-squadron',
			title: 'X-Wing: Rogue Squadron',
			author: ['Michael Stackpole'],
			isbn: ['9780553568042'],
			primary_isbn: '9780553568042',
		});
		const bacta = live({
			id: 'id-bw',
			slug: 'x-wing-bacta-war',
			title: 'X-Wing: The Bacta War',
			author: ['Michael Stackpole'],
			isbn: ['9780553570074'],
			primary_isbn: '9780553570074',
		});
		const wiki = [
			disc({
				title: 'Champions of the Force',
				author: ['Kevin J. Anderson'],
				isbn: ['9780553298024'],
			}),
			disc({
				title: 'X-Wing: Rogue Squadron',
				author: ['Michael A. Stackpole'],
				isbn: ['9780553568011'],
			}),
			disc({
				title: 'X-Wing: The Bacta War',
				author: ['Michael A. Stackpole'],
				isbn: ['9780553568042'],
			}),
		];
		const cs = buildChangeset(input({ discovered: wiki, catalog: [champions, rogue, bacta] }));
		const bySlug = new Map(cs.isbn_fixes.map((f) => [f.slug, f]));
		expect([...bySlug.keys()]).toEqual([
			'jedi-academy-champions-of-the-force',
			'x-wing-rogue-squadron',
		]);
		expect(bySlug.get('jedi-academy-champions-of-the-force')?.after.isbn).toEqual([
			'9780553298024',
		]);
		expect(bySlug.get('x-wing-rogue-squadron')?.after).toEqual({
			isbn: ['9780553568011'],
			primary_isbn: '9780553568011',
		});
		for (const f of cs.isbn_fixes) expect(f.after.isbn).toContain(f.after.primary_isbn);
		// Identity is computed post-fix, so Bacta War's date never lands on Rogue Squadron.
		expect(
			cs.updates.every(
				(u) => u.slug !== 'x-wing-rogue-squadron' || u.wiki_title === 'X-Wing: Rogue Squadron',
			),
		).toBe(true);
		expect(cs.review).toEqual([]);
	});

	it('flags instead of fixing when the evidence is unclear', () => {
		// Holder has no wiki page of its own → can't source a replacement.
		const lonely = { ...redHarvest };
		const { fixes, flagged } = findIsbnConflicts([wikiScourge], [lonely, scourge], new Map());
		expect(fixes).toEqual([]);
		expect(flagged[0]?.slug).toBe('red-harvest');

		// Wiki lists the same ISBN for both pages.
		const both = findIsbnConflicts(
			[wikiScourge, { ...wikiRed, isbn: ['9780345511171', '9780345511225'] }],
			[redHarvest, scourge],
			new Map(),
		);
		expect(both.fixes).toEqual([]);
		expect(both.flagged.length).toBeGreaterThan(0);

		// Open Library names the holder, not the wiki owner.
		const ol = findIsbnConflicts(
			[wikiScourge, wikiRed],
			[redHarvest, scourge],
			new Map([['9780345511225', 'Star Wars: Red Harvest']]),
		);
		expect(ol.fixes).toEqual([]);
		expect(ol.flagged[0]?.reason).toMatch(/Open Library/);
	});

	it('does not treat the same work under a title variant as a conflict', () => {
		const dawn = live({
			id: 'id-nd',
			slug: 'a-new-dawn',
			title: 'A New Dawn',
			author: ['John Jackson Miller'],
			isbn: ['9780553392869'],
		});
		const wiki = disc({
			title: 'A New Dawn',
			author: ['Dave Filoni', 'John Jackson Miller'],
			isbn: ['9780553392869'],
		});
		const r = findIsbnConflicts([wiki], [dawn], new Map());
		expect(r).toEqual({ fixes: [], flagged: [] });
	});
});

describe('inserts', () => {
	const lookup = (over: Partial<InsertLookup> = {}): InsertLookup => ({
		cover: { url: 'https://covers.openlibrary.org/b/id/9-L.jpg', source: 'openlibrary:isbn:x' },
		audience: [gbFiction],
		...over,
	});
	const ghost = disc({
		title: 'Tatooine Ghost',
		author: ['Troy Denning'],
		isbn: ['9780345456687'],
		date_published: '2003-03-04',
		format: ['Hardcover'],
	});

	it('builds a full row with an OL cover (never the wiki image) and a proposed slug', () => {
		const cs = buildChangeset(
			input({
				discovered: [ghost],
				catalog: [live()],
				lookups: new Map([['Tatooine Ghost', lookup()]]),
			}),
		);
		const ins = cs.inserts[0];
		expect(ins?.slug).toBe('tatooine-ghost');
		expect(ins?.row.cover_image).toBe('https://covers.openlibrary.org/b/id/9-L.jpg');
		expect(ins?.row.type).toBe('Adult Novel');
		expect(ins?.type_source).toBe('lookup');
		expect(ins?.needs_type).toBeUndefined();
		expect(ins?.row.primary_isbn).toBe('9780345456687');
		expect(ins?.row.synopsis).toBeNull();
	});

	it('flags needs_type (and leaves type unset) when evidence is missing or conflicting', () => {
		const conflicting = lookup({
			audience: [gbFiction, { ...gbFiction, labels: ['Juvenile Fiction / Media Tie-In'] }],
		});
		const noIsbn = disc({
			title: 'Mandorla',
			author: ['Alex Irvine'],
			isbn: [],
			date_published: null,
		});
		const cs = buildChangeset(
			input({
				discovered: [ghost, noIsbn],
				lookups: new Map([
					['Tatooine Ghost', conflicting],
					['Mandorla', lookup()],
				]),
			}),
		);
		for (const i of cs.inserts) {
			expect(i.needs_type).toBe(true);
			expect('type' in i.row).toBe(false);
		}
		expect(cs.summary.inserts_needs_type).toBe(2);
		const m = cs.inserts.find((i) => i.slug === 'mandorla');
		expect(m?.type_reason).toMatch(/no ISBN/);
		expect(m?.flags.join()).toMatch(/possibly unpublished/);
	});

	it('Canon rows keep their bucket type; operator overrides win', () => {
		const canon = disc({
			title: 'Last Shot',
			canon: 'Canon',
			type: 'Adult Novel',
			isbn: ['9780525622130'],
		});
		const cs = buildChangeset(
			input({ discovered: [canon, ghost], typeOverrides: { 'Tatooine Ghost': 'YA Novel' } }),
		);
		expect(cs.inserts.find((i) => i.slug === 'last-shot')?.type_source).toBe('wiki-bucket');
		const g = cs.inserts.find((i) => i.slug === 'tatooine-ghost');
		expect(g?.row.type).toBe('YA Novel');
		expect(g?.type_source).toBe('override');
	});

	it('excluded titles are never inserted', () => {
		const boba = disc({ title: 'Untitled Boba Fett novel', isbn: [], author: ['Karen Traviss'] });
		const cs = buildChangeset(
			input({
				discovered: [boba, ghost],
				excludedTitles: new Map([['Untitled Boba Fett novel', 'placeholder']]),
			}),
		);
		expect(cs.inserts.map((i) => i.wiki_title)).toEqual(['Tatooine Ghost']);
		expect(cs.excluded.map((e) => e.wiki_title)).toEqual(['Untitled Boba Fett novel']);
	});

	it('drops an "edited by" credit from author', () => {
		const anh = disc({
			title: 'Star Wars: A New Hope (paperback novel)',
			canon: 'Canon',
			type: 'Middle Grade Novel',
			author: ['Ryder Windham', 'edited by Emil Fortune'],
			isbn: ['9781405285421'],
		});
		const cs = buildChangeset(input({ discovered: [anh] }));
		expect(cs.inserts[0]?.row.author).toEqual(['Ryder Windham']);
	});

	it('is deterministic: sorted by slug, identical on re-build', () => {
		const a = disc({ title: 'Zeta Book', author: ['Z'], isbn: [], source_pageid: 1 });
		const b = disc({ title: 'Alpha Book', author: ['A'], isbn: [], source_pageid: 2 });
		const one = buildChangeset(input({ discovered: [a, b] }));
		const two = buildChangeset(input({ discovered: [b, a] }));
		expect(one.inserts.map((i) => i.slug)).toEqual(['alpha-book', 'zeta-book']);
		expect(JSON.stringify(one)).toBe(JSON.stringify(two));
	});
});

describe('canceled auto-exclusion', () => {
	it('excludes {{Canceled}} pages even when not on the explicit list', () => {
		const canceled = disc({ title: 'Mandorla', author: ['Alex Irvine'], isbn: [] });
		const kept = disc({
			title: 'Tatooine Ghost',
			author: ['Troy Denning'],
			isbn: ['9780345456687'],
		});
		const cs = buildChangeset(
			input({ discovered: [canceled, kept], canceledTitles: new Set(['Mandorla']) }),
		);
		expect(cs.inserts.map((i) => i.wiki_title)).toEqual(['Tatooine Ghost']);
		expect(cs.excluded).toEqual([
			{
				wiki_title: 'Mandorla',
				slugs: [],
				reason: 'canceled — {{Canceled}} on the Wookieepedia page',
			},
		]);
	});

	it('keeps the explicit reason and notes the tag when both apply', () => {
		const cs = buildChangeset(
			input({
				discovered: [disc({ title: 'Blood Oath', author: ['Elaine Cunningham'] })],
				excludedTitles: new Map([['Blood Oath', 'canceled — never published']]),
				canceledTitles: new Set(['Blood Oath']),
			}),
		);
		expect(cs.excluded[0]?.reason).toBe(
			'canceled — never published (also {{Canceled}} on the wiki)',
		);
		expect(cs.inserts).toEqual([]);
	});
});

describe('edition variant: ISBN moves off the base row onto a new insert', () => {
	const heir = live({
		isbn: ['9780553296129', '9780345528292', '9780553073270'],
		primary_isbn: '9780553296129',
	});
	const base = disc({ isbn: ['9780553073270'], format: ['Paperback'] });
	const anniversary = disc({
		title: 'Heir to the Empire: The 20th Anniversary Edition',
		isbn: ['9780345528292'],
		date_published: '2011-09-06',
		format: ['Hardcover'],
		source_pageid: 2000,
	});
	const lookups = new Map([
		[
			'Heir to the Empire: The 20th Anniversary Edition',
			{
				cover: { url: 'https://covers.openlibrary.org/b/id/7835960-L.jpg', source: 'ol' },
				audience: [
					{ ...gbFiction, matchedTitle: 'Heir to the Empire', matchedAuthors: ['Timothy Zahn'] },
				],
			},
		],
	]);

	it('removes the variant ISBN from the base row and inserts the variant with it', () => {
		const cs = buildChangeset(input({ discovered: [base, anniversary], catalog: [heir], lookups }));
		const f = cs.isbn_fixes.find((x) => x.slug === 'heir-to-the-empire');
		expect(f?.after.isbn).toEqual(['9780553296129', '9780553073270']);
		expect(f?.after.primary_isbn).toBe('9780553296129');
		expect(f?.after.isbn).toContain(f?.after.primary_isbn);
		expect(f?.replacements[0]?.evidence.removed_isbn_owner).toBe(
			'insert:heir-to-the-empire-the-20th-anniversary-edition',
		);
		const ins = cs.inserts.find((i) => i.wiki_title === anniversary.title);
		expect(ins?.slug).toBe('heir-to-the-empire-the-20th-anniversary-edition');
		expect(ins?.row.isbn).toEqual(['9780345528292']);
		expect(ins?.row.type).toBe('Adult Novel');
		// The 2011 date never lands on the base row.
		expect(cs.updates.some((u) => u.changes.date_published?.after === '2011-09-06')).toBe(false);
		expect(cs.review).toEqual([]);
	});

	it('never drops an ISBN: if the variant would not be inserted, the move is flagged', () => {
		const excludedVariant = buildChangeset(
			input({
				discovered: [base, { ...anniversary, title: 'Heir to the Empire: Expanded Edition' }],
				catalog: [
					heir,
					live({
						id: 'id-dup',
						slug: 'heir-to-the-empire-expanded-edition',
						title: 'Heir to the Empire: Expanded Edition',
						isbn: [],
					}),
					live({
						id: 'id-dup2',
						slug: 'heir-expanded-2',
						title: 'Heir to the Empire: Expanded Edition',
						isbn: [],
					}),
				],
			}),
		);
		// Variant matches two catalog rows by title → AMBIGUOUS, not NEW → ISBN stays put.
		expect(excludedVariant.isbn_fixes).toEqual([]);
		expect(excludedVariant.flagged_isbn_conflicts[0]?.reason).toMatch(/would drop the ISBN/);
	});
});

describe('cover fixes', () => {
	const red = live({
		id: 'id-rh',
		slug: 'red-harvest',
		title: 'Red Harvest',
		author: ['Joe Schreiber'],
		isbn: ['9780345511225', '9780345511171'],
		primary_isbn: '9780345511225',
		cover_image: 'https://images2.penguinrandomhouse.com/cover/9780345511225',
	});
	const scourge = live({
		id: 'id-sc',
		slug: 'scourge',
		title: 'Scourge',
		author: ['Jeff Grubb'],
		isbn: ['9780345534439'],
		cover_image: 'https://x/scourge.jpg',
	});
	const wiki = [
		disc({ title: 'Scourge', author: ['Jeff Grubb'], isbn: ['9780345511225'] }),
		disc({ title: 'Red Harvest', author: ['Joe Schreiber'], isbn: ['9780345511171'] }),
	];

	it('rebuilds a cover derived from a misfiled ISBN from the corrected ISBN', () => {
		const cs = buildChangeset(
			input({
				discovered: wiki,
				catalog: [red, scourge],
				olCoverByIsbn: new Map([
					[
						'9780345511171',
						{
							url: 'https://covers.openlibrary.org/b/id/5-L.jpg',
							source: 'openlibrary:isbn:9780345511171',
						},
					],
				]),
			}),
		);
		expect(cs.cover_fixes).toEqual([
			{
				id: 'id-rh',
				slug: 'red-harvest',
				title: 'Red Harvest',
				before: 'https://images2.penguinrandomhouse.com/cover/9780345511225',
				after: 'https://covers.openlibrary.org/b/id/5-L.jpg',
				source: 'openlibrary:isbn:9780345511171',
				reason:
					'current cover is built from misfiled ISBN 9780345511225; rebuilt from corrected ISBN 9780345511171',
			},
		]);
		expect(cs.summary.cover_fixes).toBe(1);
	});

	it('flags (no cover fix) when Open Library has no valid cover for the corrected ISBN', () => {
		const cs = buildChangeset(
			input({
				discovered: wiki,
				catalog: [red, scourge],
				olCoverByIsbn: new Map([['9780345511171', null]]),
			}),
		);
		expect(cs.cover_fixes).toEqual([]);
		expect(cs.review[0]?.reason).toMatch(/no valid cover/);
	});

	it('leaves covers alone when they were not built from the removed ISBN', () => {
		const cs = buildChangeset(
			input({
				discovered: wiki,
				catalog: [{ ...red, cover_image: 'https://ol/b/id/9-L.jpg' }, scourge],
			}),
		);
		expect(cs.cover_fixes).toEqual([]);
	});
});

describe('flagged update approvals', () => {
	it('marks a flagged update approved only for the exact reviewed change', () => {
		const d = disc({ date_published: '2012-03-13', format: ['Paperback'] });
		const c = live({ date_published: '2011-06-21', format: ['Paperback'] });
		const key = dateApprovalKey('heir-to-the-empire', {
			before: '2011-06-21',
			after: '2012-03-13',
		});
		const approved = buildChangeset(
			input({ discovered: [d], catalog: [c], approvedDateUpdates: new Set([key]) }),
		);
		expect(approved.updates[0]?.flags).toContain('year changes');
		expect(approved.updates[0]?.review_status).toBe('approved');
		expect(approved.summary.updates_flagged_pending).toBe(0);
		const stale = buildChangeset(
			input({
				discovered: [{ ...d, date_published: '2013-01-01' }],
				catalog: [c],
				approvedDateUpdates: new Set([key]),
			}),
		);
		expect(stale.updates[0]?.review_status).toBe('pending');
	});
});

describe('publisher normalization (inserts)', () => {
	const splits = new Map([
		['Del Rey (US) Arrow Books (UK)', 'Del Rey'],
		['Egmont UK Ltd Disney–Lucasfilm Press', 'Disney–Lucasfilm Press'],
	]);
	const catalogPubs = ['Del Rey', 'Disney Lucasfilm Press', 'Bantam Spectra'];

	it('keeps the chosen imprint of a run-together value', () => {
		expect(normalizePublisher('Del Rey (US) Arrow Books (UK)', splits, catalogPubs)).toEqual({
			value: 'Del Rey',
			rule: 'split',
		});
		expect(normalizePublisher('Egmont UK Ltd Disney–Lucasfilm Press', splits, catalogPubs)).toEqual(
			{
				value: 'Disney Lucasfilm Press',
				rule: 'split+catalog-spelling',
			},
		);
	});

	it('folds only spelling/punctuation variants to the catalog form', () => {
		expect(normalizePublisher('Disney–Lucasfilm Press', splits, catalogPubs)).toEqual({
			value: 'Disney Lucasfilm Press',
			rule: 'catalog-spelling',
		});
		expect(normalizePublisher('del rey', splits, catalogPubs).value).toBe('Del Rey');
		// Distinct imprints are never merged.
		expect(normalizePublisher('Random House Worlds', splits, catalogPubs)).toEqual({
			value: 'Random House Worlds',
			rule: null,
		});
		expect(normalizePublisher('Bantam Spectra', splits, catalogPubs).rule).toBeNull();
		expect(normalizePublisher('None', splits, catalogPubs).value).toBeNull();
	});

	it('applies to inserts and lists every changed value', () => {
		const a = disc({
			title: 'Book A',
			author: ['A'],
			isbn: [],
			publisher: 'Disney–Lucasfilm Press',
		});
		const b = disc({
			title: 'Book B',
			author: ['B'],
			isbn: [],
			publisher: 'Del Rey (US) Arrow Books (UK)',
		});
		const c = disc({ title: 'Book C', author: ['C'], isbn: [], publisher: 'Random House Worlds' });
		const cs = buildChangeset(
			input({
				discovered: [a, b, c],
				catalog: [
					live({ publisher: 'Disney Lucasfilm Press' }),
					live({ id: 'id-2', slug: 'x', title: 'X', publisher: 'Del Rey' }),
				],
				publisherSplits: splits,
			}),
		);
		expect(cs.inserts.map((i) => i.row.publisher)).toEqual([
			'Disney Lucasfilm Press',
			'Del Rey',
			'Random House Worlds',
		]);
		expect(cs.publisher_changes).toEqual([
			{ from: 'Del Rey (US) Arrow Books (UK)', to: 'Del Rey', rule: 'split', slugs: ['book-b'] },
			{
				from: 'Disney–Lucasfilm Press',
				to: 'Disney Lucasfilm Press',
				rule: 'catalog-spelling',
				slugs: ['book-a'],
			},
		]);
		expect(cs.inserts.every((i) => !i.flags.some((f) => f.startsWith('suspect publisher')))).toBe(
			true,
		);
	});
});
