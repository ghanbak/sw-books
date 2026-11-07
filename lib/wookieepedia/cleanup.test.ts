import { describe, expect, it } from 'vitest';
import {
	type LiveState,
	cleanupBlockingProblems,
	planCleanup,
	planIsbnMembershipFix,
	planSynopsisFill,
} from './apply-plan';
import {
	type CleanupChangeset,
	type CleanupRow,
	type CoverCandidate,
	type CoverReview,
	type IsbnEvidence,
	type MisfiledIsbnRemoval,
	type OlWorkFacts,
	type SynopsisFill,
	type WorkCoverEvidence,
	applyApprovedAdditions,
	applyApprovedRemovals,
	applyInvalidIsbnRemovals,
	applyMisfiledIsbnRemovals,
	buildCleanupChangeset,
	coverIsbns,
	coverKey,
	decideIsbnMembership,
	findWorkCover,
	isWikiImage,
	olNamesBook,
	olTitleForm,
	pickCover,
	pickResetPrimary,
	sharedPhrases,
	synopsisProblems,
	vetFallbackCover,
} from './cleanup';

// Real-shaped ISBNs (valid check digits) from the 2026-10-21 prod investigation.
const HOPE_HC = '9781368075930';
const HOPE_PB = '9781368093767';
const SITH_US = '9780593358610';
const SITH_UK = '9781529150063';

function row(over: Partial<CleanupRow> = {}): CleanupRow {
	return {
		id: 'id-x',
		slug: 'x',
		title: 'X',
		isbn: [],
		primary_isbn: null,
		cover_image: 'https://covers.openlibrary.org/b/id/1-L.jpg',
		synopsis: 'Already written.',
		date_published: '2020-01-01',
		...over,
	};
}

function evidence(over: Partial<IsbnEvidence> = {}): IsbnEvidence {
	return {
		wiki_title: null,
		wiki_infobox_isbns: [],
		wiki_page_isbns: [],
		openlibrary: {},
		other_rows_with_primary: [],
		...over,
	};
}

const hope = row({
	id: 'id-qh',
	slug: 'queens-hope',
	title: "Queen's Hope",
	isbn: [HOPE_HC],
	primary_isbn: HOPE_PB,
});

describe('isbn membership', () => {
	it('adds primary_isbn to isbn[] when OL names the book and the wiki lists it', () => {
		const d = decideIsbnMembership(
			hope,
			evidence({
				wiki_title: "Queen's Hope",
				wiki_infobox_isbns: [HOPE_HC],
				wiki_page_isbns: [HOPE_HC, HOPE_PB],
				openlibrary: {
					[HOPE_PB]: { title: "Queen's Hope", subtitle: null, work: '/works/W1' },
					[HOPE_HC]: { title: "Queen's Hope", subtitle: 'Star Wars', work: '/works/W1' },
				},
			}),
		);
		expect(d?.kind).toBe('fix');
		if (d?.kind !== 'fix') return;
		expect(d.fix.action).toBe('add_primary_to_isbn');
		expect(d.fix.after).toEqual({ isbn: [HOPE_HC, HOPE_PB], primary_isbn: HOPE_PB });
		expect(d.fix.before.isbn).toEqual([HOPE_HC]); // curated order kept, nothing removed
	});

	it('adds on OL title + same OL work even when the wiki page omits it (UK edition)', () => {
		const sith = row({
			slug: 'shadow-of-the-sith',
			title: 'Shadow of the Sith',
			isbn: [SITH_US],
			primary_isbn: SITH_UK,
		});
		const d = decideIsbnMembership(
			sith,
			evidence({
				wiki_title: 'Shadow of the Sith',
				wiki_infobox_isbns: ['9780593358603'],
				wiki_page_isbns: ['9780593358603', SITH_US],
				openlibrary: {
					[SITH_UK]: { title: 'Shadow of the Sith', subtitle: 'Star Wars', work: '/works/W2' },
					[SITH_US]: { title: 'Star Wars', subtitle: 'Shadow of the Sith', work: '/works/W2' },
				},
			}),
		);
		expect(d?.kind).toBe('fix');
		if (d?.kind !== 'fix') return;
		expect(d.fix.after.isbn).toEqual([SITH_US, SITH_UK]);
		expect(d.fix.notes.join(' ')).toMatch(/9780593358603 is not on this row/);
	});

	it('resets primary_isbn to an own ISBN when the evidence assigns it to another book', () => {
		const d = decideIsbnMembership(
			hope,
			evidence({
				wiki_infobox_isbns: [HOPE_HC],
				openlibrary: { [HOPE_PB]: { title: 'Dark Legends', subtitle: null, work: '/works/W9' } },
				other_rows_with_primary: ['dark-legends'],
			}),
		);
		expect(d?.kind).toBe('fix');
		if (d?.kind !== 'fix') return;
		expect(d.fix.action).toBe('reset_primary');
		expect(d.fix.after).toEqual({ isbn: [HOPE_HC], primary_isbn: HOPE_HC });
	});

	it('flags conflicting or thin evidence instead of guessing', () => {
		const conflicting = decideIsbnMembership(
			hope,
			evidence({
				wiki_page_isbns: [HOPE_PB],
				wiki_title: "Queen's Hope",
				openlibrary: { [HOPE_PB]: { title: "Queen's Hope", subtitle: null, work: null } },
				other_rows_with_primary: ['queens-peril'],
			}),
		);
		expect(conflicting?.kind).toBe('flag');
		// OL agrees on the title, but nothing independent (wiki / same work) backs it.
		const thin = decideIsbnMembership(
			hope,
			evidence({
				openlibrary: { [HOPE_PB]: { title: "Queen's Hope", subtitle: null, work: '/works/W3' } },
			}),
		);
		expect(thin?.kind).toBe('flag');
		// Belongs elsewhere but the row has no ISBN of its own to fall back to.
		const empty = decideIsbnMembership(
			row({ title: 'Path of Deceit', isbn: [], primary_isbn: HOPE_PB }),
			evidence({ other_rows_with_primary: ['queens-hope'] }),
		);
		expect(empty?.kind).toBe('flag');
	});

	it('does nothing when primary_isbn is already in isbn[] or null', () => {
		expect(
			decideIsbnMembership(row({ isbn: [HOPE_HC], primary_isbn: HOPE_HC }), evidence()),
		).toBeNull();
		expect(decideIsbnMembership(row({ primary_isbn: null }), evidence())).toBeNull();
	});

	it('olNamesBook: ignores the bare "Star Wars" title and edition variants', () => {
		const ol = (title: string, subtitle: string | null = null) => ({ title, subtitle, work: null });
		expect(
			olNamesBook(
				ol('Path of Deceit', 'Star Wars: The High Republic'),
				'The High Republic: Path of Deceit',
			),
		).toBe(true);
		expect(olNamesBook(ol('Star Wars', 'Shadow of the Sith'), 'Shadow of the Sith')).toBe(true);
		expect(olNamesBook(ol('Star Wars'), 'Shadow of the Sith')).toBe(false);
		expect(olNamesBook(ol('Rogue One: A Junior Novel'), 'Rogue One')).toBe(false);
		expect(olNamesBook(null, 'X')).toBe(false);
	});

	it('pickResetPrimary prefers the wiki infobox ISBN, else the first own ISBN', () => {
		expect(pickResetPrimary(['A', 'B'], ['B'])).toBe('B');
		expect(pickResetPrimary(['A', 'B'], [])).toBe('A');
		expect(pickResetPrimary([], ['B'])).toBeNull();
	});
});

describe('approved isbn[] additions', () => {
	const SITH_WIKI = '9780593358603';
	const sith = row({
		id: 'id-sots',
		slug: 'shadow-of-the-sith',
		title: 'Shadow of the Sith',
		isbn: [SITH_US],
		primary_isbn: SITH_UK,
	});
	const ev = evidence({
		wiki_title: 'Shadow of the Sith',
		wiki_infobox_isbns: [SITH_WIKI],
		wiki_page_isbns: [SITH_WIKI, SITH_US],
		openlibrary: {
			[SITH_UK]: { title: 'Shadow of the Sith', subtitle: 'Star Wars', work: '/works/W2' },
			[SITH_US]: { title: 'Star Wars', subtitle: 'Shadow of the Sith', work: '/works/W2' },
		},
	});
	const approval = { slug: 'shadow-of-the-sith', isbn: SITH_WIKI, note: 'wiki infobox' };
	const build = (holders: Map<string, string[]>, additions = [approval]) =>
		buildCleanupChangeset({
			rows: [sith],
			asOf: '2026-10-21',
			isbnEvidence: new Map([['shadow-of-the-sith', ev]]),
			coverCandidates: new Map(),
			drafts: { drafts: {}, skipped: {} },
			wikiText: new Map(),
			approvedIsbnAdditions: additions,
			isbnHolders: holders,
		});

	it('folds into the decided fix as ONE write, primary unchanged, nothing removed', () => {
		const cs = build(new Map());
		expect(cs.isbn_fixes).toHaveLength(1);
		const f = cs.isbn_fixes[0];
		expect(f?.action).toBe('add_primary_to_isbn');
		expect(f?.before).toEqual({ isbn: [SITH_US], primary_isbn: SITH_UK });
		expect(f?.after).toEqual({ isbn: [SITH_US, SITH_UK, SITH_WIKI], primary_isbn: SITH_UK });
		expect(f?.approved_additions).toEqual([approval]);
		expect(f?.notes.join(' ')).not.toMatch(/9780593358603 is not on this row/);
		expect(cs.flagged.isbn).toEqual([]);
	});

	it('refuses an addition another row holds, or one missing from the wiki infobox', () => {
		const held = build(new Map([[SITH_WIKI, ['brotherhood']]]));
		expect(held.isbn_fixes[0]?.after.isbn).toEqual([SITH_US, SITH_UK]);
		expect(held.flagged.isbn[0]?.reason).toMatch(/held by brotherhood/);
		const offWiki = build(new Map(), [{ ...approval, isbn: '9780593358627' }]);
		expect(offWiki.flagged.isbn[0]?.reason).toMatch(/not in the wiki infobox/);
		expect(build(new Map(), [{ ...approval, slug: 'nope' }]).flagged.isbn[0]?.reason).toMatch(
			/no such row/,
		);
	});

	it('creates an add_approved_isbn fix when primary_isbn is already fine; no-op if present', () => {
		const fine = row({ id: 'id-b', slug: 'b', isbn: [SITH_US], primary_isbn: SITH_US });
		const r = applyApprovedAdditions(fine, null, [{ ...approval, slug: 'b' }], ev, new Map());
		expect(r.fix?.action).toBe('add_approved_isbn');
		expect(r.fix?.after).toEqual({ isbn: [SITH_US, SITH_WIKI], primary_isbn: SITH_US });
		const present = row({ isbn: [SITH_US, SITH_WIKI], primary_isbn: SITH_US });
		expect(applyApprovedAdditions(present, null, [approval], ev, new Map()).fix).toBeNull();
	});
});

describe('approved collision removals (#78)', () => {
	const PERIL_HC = '9781368057141';
	const PERIL_PB = '9781368063258';
	const SHADOW_PB = '9781368057943';
	const peril = row({
		id: 'id-qp',
		slug: 'queens-peril',
		title: "Queen's Peril",
		isbn: [PERIL_HC, PERIL_PB, SHADOW_PB],
		primary_isbn: PERIL_HC,
	});
	const ev = evidence({
		wiki_title: "Queen's Peril",
		wiki_infobox_isbns: [PERIL_HC],
		openlibrary: {
			[PERIL_HC]: { title: "Queen's Peril", subtitle: null, work: '/works/W1' },
			[SHADOW_PB]: { title: "Queen's Shadow", subtitle: null, work: '/works/W2' },
		},
	});
	const removal = {
		slug: 'queens-peril',
		isbn: SHADOW_PB,
		owner: 'queens-shadow',
		note: 'OL titles it Queen’s Shadow',
	};
	const shared = new Map([[SHADOW_PB, ['queens-peril', 'queens-shadow']]]);
	const build = (holders: Map<string, string[]>, removals = [removal]) =>
		buildCleanupChangeset({
			rows: [peril],
			asOf: '2026-11-06',
			isbnEvidence: new Map([['queens-peril', ev]]),
			coverCandidates: new Map(),
			drafts: { drafts: {}, skipped: {} },
			wikiText: new Map(),
			approvedIsbnAdditions: [],
			approvedIsbnRemovals: removals,
			isbnHolders: holders,
		});

	it('drops the shared ISBN from the row it does not belong to, primary unchanged', () => {
		const cs = build(shared);
		expect(cs.isbn_fixes).toHaveLength(1);
		const f = cs.isbn_fixes[0];
		expect(f?.action).toBe('remove_approved_isbn');
		expect(f?.before).toEqual({ isbn: [PERIL_HC, PERIL_PB, SHADOW_PB], primary_isbn: PERIL_HC });
		expect(f?.after).toEqual({ isbn: [PERIL_HC, PERIL_PB], primary_isbn: PERIL_HC });
		expect(f?.approved_removals).toEqual([removal]);
		expect(cs.flagged.isbn).toEqual([]);
		expect(cleanupBlockingProblems({ ...cs, cover_fills: [], synopsis_fills: [] })).toEqual([]);
	});

	it('refuses when the owner does not hold it, it is the primary, or OL names this book', () => {
		const orphan = build(new Map([[SHADOW_PB, ['queens-peril']]]));
		expect(orphan.isbn_fixes).toEqual([]);
		expect(orphan.flagged.isbn[0]?.reason).toMatch(/would drop it from the catalog/);
		const asPrimary = row({ ...peril, primary_isbn: SHADOW_PB });
		expect(applyApprovedRemovals(asPrimary, null, [removal], ev, shared).flags[0]?.reason).toMatch(
			/primary_isbn/,
		);
		const ownBook = evidence({
			...ev,
			openlibrary: { [SHADOW_PB]: { title: "Queen's Peril", subtitle: null, work: '/works/W1' } },
		});
		expect(applyApprovedRemovals(peril, null, [removal], ownBook, shared).fix).toBeNull();
		expect(build(shared, [{ ...removal, slug: 'nope' }]).flagged.isbn[0]?.reason).toMatch(
			/no such row/,
		);
	});

	it('refuses mutual removals (both rows would lose it); no-op once removed', () => {
		const mutual = build(shared, [
			removal,
			{ ...removal, slug: 'queens-shadow', owner: 'queens-peril' },
		]);
		expect(mutual.isbn_fixes).toEqual([]);
		expect(mutual.flagged.isbn.map((f) => f.reason).join()).toMatch(/also approved to lose it/);
		const done = row({ ...peril, isbn: [PERIL_HC, PERIL_PB] });
		const r = applyApprovedRemovals(done, null, [removal], ev, shared);
		expect(r).toEqual({ fix: null, flags: [] });
	});
});

describe('invalid-ISBN removals (#86)', () => {
	const BAD = '9780553570050'; // stored for Wedge's Gamble; bad check digit
	const PB = '9780553568028'; // Bantam Spectra PB, OL-verified
	const wedge = row({
		id: 'id-wg',
		slug: 'x-wing-wedges-gamble',
		title: "Wedge's Gamble",
		isbn: [BAD],
		primary_isbn: BAD,
	});
	const ev = evidence({ wiki_title: "X-wing: Wedge's Gamble", wiki_infobox_isbns: [PB] });
	const addition = { slug: wedge.slug, isbn: PB, note: 'infobox PB' };
	const removal = { slug: wedge.slug, isbn: BAD, primary: PB, note: 'bad check digit' };
	const build = (removals: { slug: string; isbn: string; primary?: string; note: string }[]) =>
		buildCleanupChangeset({
			rows: [wedge],
			asOf: '2026-11-07',
			isbnEvidence: new Map([[wedge.slug, ev]]),
			coverCandidates: new Map(),
			drafts: { drafts: {}, skipped: {} },
			wikiText: new Map(),
			approvedIsbnAdditions: [addition],
			invalidIsbnRemovals: removals,
			isbnHolders: new Map([[BAD, [wedge.slug]]]),
		});

	it('swaps a bad primary for the approved addition in one write', () => {
		const cs = build([removal]);
		expect(cs.flagged.isbn).toEqual([]);
		expect(cs.isbn_fixes).toHaveLength(1);
		const f = cs.isbn_fixes[0];
		expect(f?.action).toBe('add_approved_isbn');
		expect(f?.before).toEqual({ isbn: [BAD], primary_isbn: BAD });
		expect(f?.after).toEqual({ isbn: [PB], primary_isbn: PB });
		expect(f?.invalid_removals).toEqual([removal]);
		expect(cleanupBlockingProblems({ ...cs, cover_fills: [], synopsis_fills: [] })).toEqual([]);
		expect(planIsbnMembershipFix(f as NonNullable<typeof f>, null).kind).toBe('isbn_fix');
	});

	it('drops a bad extra entry with no primary change', () => {
		const r = row({ isbn: [PB, BAD], primary_isbn: PB });
		const out = applyInvalidIsbnRemovals(r, null, [{ slug: 'x', isbn: BAD, note: '' }], ev);
		expect(out.fix?.action).toBe('remove_invalid_isbn');
		expect(out.fix?.after).toEqual({ isbn: [PB], primary_isbn: PB });
		expect(out.flags).toEqual([]);
	});

	it('refuses a valid ISBN, or a primary with no valid on-row replacement', () => {
		const valid = applyInvalidIsbnRemovals(
			row({ isbn: [PB], primary_isbn: PB }),
			null,
			[{ slug: 'x', isbn: PB, note: '' }],
			ev,
		);
		expect(valid.fix).toBeNull();
		expect(valid.flags[0]?.reason).toMatch(/passes the ISBN-13 check digit/);
		const noReplacement = applyInvalidIsbnRemovals(
			wedge,
			null,
			[{ ...removal, primary: undefined }],
			ev,
		);
		expect(noReplacement.flags[0]?.reason).toMatch(/no replacement primary/);
		const offRow = applyInvalidIsbnRemovals(wedge, null, [removal], ev);
		expect(offRow.fix).toBeNull();
		expect(offRow.flags[0]?.reason).toMatch(/not on the row/);
		const badReplacement = applyInvalidIsbnRemovals(
			row({ isbn: [BAD, '9780553570052'], primary_isbn: BAD }),
			null,
			[{ ...removal, primary: '9780553570051' }],
			ev,
		);
		expect(badReplacement.flags[0]?.reason).toMatch(/not a valid ISBN-13/);
	});

	it('is a no-op once removed; blocks a changeset that drops a valid ISBN as invalid', () => {
		const done = row({ isbn: [PB], primary_isbn: PB });
		expect(applyInvalidIsbnRemovals(done, null, [removal], ev)).toEqual({ fix: null, flags: [] });
		const f = build([removal]).isbn_fixes[0];
		const forged = { ...f, invalid_removals: [{ ...removal, isbn: PB }] } as NonNullable<typeof f>;
		const cs = build([removal]);
		expect(
			cleanupBlockingProblems({ ...cs, isbn_fixes: [forged], cover_fills: [], synopsis_fills: [] }),
		).toEqual(expect.arrayContaining([expect.stringMatching(/passes the check digit/)]));
	});
});

describe('misfiled-ISBN removals (#143)', () => {
	// Real ISBNs; works per Open Library.
	const TITAN = '9781845764692'; // X-Wing Rogue Squadron comic, Titan 2007
	const DARK_HORSE = '9781569713303'; // X-Wing Rogue Squadron comic, Dark Horse 1998
	const PB = '9780553568011'; // Bantam Spectra PB (the novel)
	const PB2 = '9780553409260'; // Bantam PB (the novel, same work)
	const rogue = row({
		id: 'id-rs',
		slug: 'x-wing-rogue-squadron',
		title: 'X-Wing: Rogue Squadron',
		isbn: [TITAN, DARK_HORSE, PB, PB2],
		primary_isbn: TITAN,
	});
	const ev = evidence({
		wiki_title: 'X-wing: Rogue Squadron',
		wiki_infobox_isbns: [PB],
		openlibrary: {
			// Same title as the novel — only the work tells them apart.
			[TITAN]: { title: 'X-Wing Rogue Squadron', subtitle: null, work: '/works/OL37923497W' },
			[DARK_HORSE]: {
				title: 'Star wars',
				subtitle: 'X-Wing Rogue Squadron.',
				work: '/works/OL15219983W',
			},
			[PB]: { title: 'Star Wars: Rogue Squadron', subtitle: null, work: '/works/OL84533W' },
			[PB2]: { title: 'Rogue Squadron', subtitle: null, work: '/works/OL84533W' },
		},
	});
	const titan: MisfiledIsbnRemoval = {
		slug: rogue.slug,
		isbn: TITAN,
		belongs_to: 'the Titan comic',
		primary: PB,
		note: 'comic',
	};
	const darkHorse: MisfiledIsbnRemoval = {
		slug: rogue.slug,
		isbn: DARK_HORSE,
		belongs_to: 'the Dark Horse comic',
		note: 'comic',
	};
	const build = (
		rows: CleanupRow[],
		removals: MisfiledIsbnRemoval[],
		additions: { slug: string; isbn: string; note: string }[] = [],
		e: IsbnEvidence = ev,
	) =>
		buildCleanupChangeset({
			rows,
			asOf: '2026-11-07',
			isbnEvidence: new Map(rows.map((r) => [r.slug, e])),
			coverCandidates: new Map(),
			drafts: { drafts: {}, skipped: {} },
			wikiText: new Map(),
			approvedIsbnAdditions: additions,
			misfiledIsbnRemovals: removals,
			isbnHolders: new Map(),
		});

	it('drops valid wrong-book ISBNs and resets the primary they held', () => {
		const cs = build([rogue], [titan, darkHorse]);
		expect(cs.flagged.isbn).toEqual([]);
		expect(cs.isbn_fixes).toHaveLength(1);
		const f = cs.isbn_fixes[0];
		expect(f?.action).toBe('remove_misfiled_isbn');
		expect(f?.before).toEqual({ isbn: [TITAN, DARK_HORSE, PB, PB2], primary_isbn: TITAN });
		expect(f?.after).toEqual({ isbn: [PB, PB2], primary_isbn: PB });
		expect(f?.misfiled_removals).toEqual([titan, darkHorse]);
		expect(cleanupBlockingProblems({ ...cs, cover_fills: [], synopsis_fills: [] })).toEqual([]);
		expect(planIsbnMembershipFix(f as NonNullable<typeof f>, null).kind).toBe('isbn_fix');
	});

	it('resets an unnamed primary to the wiki-infobox row ISBN', () => {
		const out = applyMisfiledIsbnRemovals(rogue, null, [{ ...titan, primary: undefined }], ev);
		expect(out.flags).toEqual([]);
		expect(out.fix?.after).toEqual({ isbn: [DARK_HORSE, PB, PB2], primary_isbn: PB });
	});

	it('swaps a wrong-book primary in isbn[] for an approved addition in one write', () => {
		// #97: acolyte-wayseeker held Mace Windu: The Glass Abyss as its only ISBN + primary.
		const MACE = '9780593723456';
		const WAY = '9780593874431';
		const way = row({
			id: 'id-aw',
			slug: 'acolyte-wayseeker',
			title: 'The Acolyte: Wayseeker',
			isbn: [MACE],
			primary_isbn: MACE,
		});
		const wayEv = evidence({ wiki_title: 'The Acolyte: Wayseeker', wiki_infobox_isbns: [WAY] });
		const cs = build(
			[way],
			[{ slug: way.slug, isbn: MACE, belongs_to: 'Mace Windu', primary: WAY, note: '' }],
			[{ slug: way.slug, isbn: WAY, note: 'infobox HC' }],
			wayEv,
		);
		expect(cs.flagged.isbn).toEqual([]);
		const f = cs.isbn_fixes[0];
		expect(f?.action).toBe('add_approved_isbn');
		expect(f?.before).toEqual({ isbn: [MACE], primary_isbn: MACE });
		expect(f?.after).toEqual({ isbn: [WAY], primary_isbn: WAY });
		expect(cleanupBlockingProblems({ ...cs, cover_fills: [], synopsis_fills: [] })).toEqual([]);
	});

	it('refuses a bad check digit, the same OL work as a kept ISBN, or no valid primary left', () => {
		const bad = applyMisfiledIsbnRemovals(
			row({ isbn: [PB, '9780553570050'], primary_isbn: PB }),
			null,
			[{ ...darkHorse, isbn: '9780553570050' }],
			ev,
		);
		expect(bad.fix).toBeNull();
		expect(bad.flags[0]?.reason).toMatch(/fails the ISBN-13 check digit/);
		const sameWork = applyMisfiledIsbnRemovals(rogue, null, [{ ...darkHorse, isbn: PB2 }], ev);
		expect(sameWork.fix).toBeNull();
		expect(sameWork.flags[0]?.reason).toMatch(/same work as the row's 9780553568011/);
		const alone = applyMisfiledIsbnRemovals(
			row({ isbn: [TITAN], primary_isbn: TITAN }),
			null,
			[{ ...titan, primary: undefined }],
			ev,
		);
		expect(alone.flags[0]?.reason).toMatch(/no other ISBN is left/);
		const offRow = applyMisfiledIsbnRemovals(rogue, null, [{ ...titan, primary: HOPE_HC }], ev);
		expect(offRow.flags[0]?.reason).toMatch(/not on the row/);
		const badPrimary = applyMisfiledIsbnRemovals(
			rogue,
			null,
			[{ ...titan, primary: '9780553570050' }],
			ev,
		);
		expect(badPrimary.flags[0]?.reason).toMatch(/not a valid ISBN-13/);
	});

	it('is a no-op once removed; blocks a changeset that drops an invalid ISBN as misfiled', () => {
		const done = row({ ...rogue, isbn: [PB, PB2], primary_isbn: PB });
		expect(applyMisfiledIsbnRemovals(done, null, [titan, darkHorse], ev)).toEqual({
			fix: null,
			flags: [],
		});
		const cs = build([rogue], [titan, darkHorse]);
		const f = cs.isbn_fixes[0] as NonNullable<(typeof cs.isbn_fixes)[number]>;
		const forged = { ...f, misfiled_removals: [{ ...darkHorse, isbn: '9780553570050' }] };
		expect(
			cleanupBlockingProblems({ ...cs, isbn_fixes: [forged], cover_fills: [], synopsis_fills: [] }),
		).toEqual(expect.arrayContaining([expect.stringMatching(/fails the check digit/)]));
	});
});

describe('covers', () => {
	const cand = (over: Partial<CoverCandidate>): CoverCandidate => ({
		isbn: '9780000000002',
		source: 'openlibrary',
		url: 'https://covers.openlibrary.org/b/id/5-L.jpg',
		head_ok: true,
		...over,
	});

	it('coverKey collapses URL spellings of the same OL / GB image', () => {
		expect(coverKey('https://covers.openlibrary.org/b/id/123-L.jpg')).toBe('ol:123');
		expect(coverKey('https://covers.openlibrary.org/b/id/123-M.jpg')).toBe('ol:123');
		expect(
			coverKey('https://books.google.com/books/content?id=AbC-1&printsec=frontcover&img=1&zoom=1'),
		).toBe('gb:AbC-1');
		expect(coverKey('https://images2.penguinrandomhouse.com/cover/9780593358610')).toBe(
			'https://images2.penguinrandomhouse.com/cover/9780593358610',
		);
	});

	it('isWikiImage spots Wookieepedia/Fandom hosting', () => {
		expect(isWikiImage('https://static.wikia.nocookie.net/starwars/images/a/ab/X.png')).toBe(true);
		expect(isWikiImage('https://covers.openlibrary.org/b/id/1-L.jpg')).toBe(false);
	});

	it('pickCover: OL before GB, HEAD-checked, never another row’s cover or a wiki image', () => {
		const gb = cand({
			source: 'google-books',
			url: 'https://books.google.com/books/content?id=G1&img=1',
		});
		const ol = cand({ url: 'https://covers.openlibrary.org/b/id/7-L.jpg' });
		expect(pickCover([gb, ol], new Map(), 'x')).toBe(ol);
		expect(pickCover([gb, { ...ol, head_ok: false }], new Map(), 'x')).toBe(gb);
		expect(pickCover([gb, ol], new Map([['ol:7', 'other']]), 'x')).toBe(gb);
		expect(pickCover([ol], new Map([['ol:7', 'x']]), 'x')).toBe(ol); // its own reservation
		const wiki = cand({ url: 'https://static.wikia.nocookie.net/starwars/images/x.jpg' });
		expect(pickCover([wiki], new Map(), 'x')).toBeNull();
		expect(pickCover([cand({ url: null })], new Map(), 'x')).toBeNull();
		const search = cand({
			source: 'google-books-search',
			url: 'https://books.google.com/books/content?id=S1',
		});
		expect(pickCover([search, gb], new Map(), 'x')).toBe(gb);
	});

	it('coverIsbns: isbn[] then primary, valid and de-duplicated', () => {
		expect(coverIsbns(row({ isbn: [HOPE_HC, 'junk'], primary_isbn: HOPE_PB }))).toEqual([
			HOPE_HC,
			HOPE_PB,
		]);
		expect(coverIsbns(row({ isbn: [HOPE_HC], primary_isbn: HOPE_HC }))).toEqual([HOPE_HC]);
	});
});

describe('synopsis guards', () => {
	it('synopsisProblems: one short sentence, punctuated, no stray whitespace', () => {
		expect(synopsisProblems('Luke trains on Dagobah.')).toEqual([]);
		expect(synopsisProblems('')).toEqual(['empty']);
		expect(synopsisProblems('No period')).toContain('does not end with sentence punctuation');
		expect(synopsisProblems('One. Two.')).toContain('more than one sentence');
		expect(synopsisProblems(`${'a'.repeat(170)}.`)[0]).toMatch(/longer than/);
		expect(synopsisProblems(' Padded.')).toContain('leading/trailing whitespace');
	});

	it('sharedPhrases finds copied word runs regardless of case and punctuation', () => {
		const wiki = 'Hunter, Wrecker, Tech, and Omega gamble on a mission to help rebuild Pabu.';
		expect(sharedPhrases('They gamble on a mission to help rebuild Pabu.', wiki, 6)).toEqual([
			'gamble on a mission to help',
			'on a mission to help rebuild',
			'a mission to help rebuild pabu',
		]);
		expect(sharedPhrases('The Bad Batch take risky jobs to fund Pabu.', wiki, 6)).toEqual([]);
	});
});

describe('buildCleanupChangeset', () => {
	const drafts = {
		drafts: {
			a: { synopsis: 'A clean original line.', basis: 'facts' },
			b: { synopsis: 'Copied text about a mission to help rebuild Pabu.', basis: 'facts' },
			c: { synopsis: 'Never used.', basis: 'facts' },
			future: { synopsis: 'An announced premise.', basis: 'premise' },
		},
		skipped: { d: 'plot not public' },
	};
	const rows: CleanupRow[] = [
		row({ id: '1', slug: 'a', title: 'A', cover_image: null, synopsis: null, isbn: [HOPE_HC] }),
		row({ id: '2', slug: 'b', title: 'B', cover_image: '', synopsis: null, isbn: [HOPE_PB] }),
		row({ id: '3', slug: 'c', title: 'C', synopsis: 'Hand-written already.' }),
		row({ id: '4', slug: 'd', title: 'D', synopsis: null }),
		row({
			id: '5',
			slug: 'future',
			title: 'F',
			cover_image: null,
			synopsis: null,
			date_published: '2027-05-04',
			isbn: [HOPE_HC],
		}),
	];
	const shared = 'https://covers.openlibrary.org/b/id/42-L.jpg';
	const cs = buildCleanupChangeset({
		rows,
		asOf: '2026-10-21',
		isbnEvidence: new Map(),
		coverCandidates: new Map([
			['a', [{ isbn: HOPE_HC, source: 'openlibrary', url: shared, head_ok: true }]],
			// b wants the same image — already reserved by a (slug order), so it stays missing.
			['b', [{ isbn: HOPE_HC, source: 'openlibrary', url: shared, head_ok: true }]],
		]),
		drafts,
		approvedIsbnAdditions: [],
		isbnHolders: new Map(),
		wikiText: new Map([
			['a', 'Unrelated page text.'],
			['b', 'Hunter and Omega gamble on a mission to help rebuild Pabu after the wave.'],
			['future', 'Page text.'],
		]),
	});

	it('fills only null/blank covers and never hands one image to two rows', () => {
		expect(cs.cover_fills.map((c) => [c.slug, c.before, c.after])).toEqual([['a', null, shared]]);
		expect(cs.flagged.covers_missing.map((f) => f.slug)).toEqual(['b']);
		expect(cs.flagged.covers_missing[0]?.reason).toMatch(/already used by a/);
		expect(cs.flagged.covers_not_yet_available.map((f) => f.slug)).toEqual(['future']);
	});

	it('fills only null synopses, marks every fill drafted, and lists skips', () => {
		expect(cs.synopsis_fills.map((s) => [s.slug, s.status])).toEqual([
			['a', 'drafted'],
			['future', 'drafted'],
		]);
		expect(cs.synopsis_fills[1]?.flags[0]).toMatch(/not yet released/);
		const skipped = Object.fromEntries(cs.flagged.synopses_skipped.map((f) => [f.slug, f.reason]));
		expect(skipped.b).toMatch(/shares wiki phrasing/);
		expect(skipped.d).toBe('plot not public');
		expect(cs.flagged.synopsis_drafts_unused.map((f) => f.slug)).toEqual(['c']);
		expect(cs.summary.synopsis_fills).toBe(2);
	});
});

// Real-shaped Open Library records from the 2026-10-22 prod investigation.
describe('work-level cover fallback', () => {
	const LAST_SHOT = '9780525622130';
	const CHILDREN = '9780553840087';
	const IMPERIAL = '9781484716601';
	const LAST_SHOT_WORK = '/works/OL19653601W';
	const LAST_SHOT_URL = 'https://covers.openlibrary.org/b/id/8568524-L.jpg';
	const CHILDREN_URL = 'https://covers.openlibrary.org/b/id/372419-L.jpg';

	const work = (over: Partial<OlWorkFacts> = {}): OlWorkFacts => ({
		key: LAST_SHOT_WORK,
		title: 'Star Wars - Last Shot - A Han and Lando Novel',
		subtitle: null,
		authors: ['Daniel José Older'],
		covers: [8568524],
		first_publish_year: 2018,
		languages: [],
		...over,
	});
	const lastShot = row({
		id: 'id-ls',
		slug: 'last-shot',
		title: 'Last Shot',
		author: ['Daniel José Older'],
		canon: 'Canon',
		isbn: [LAST_SHOT],
		primary_isbn: LAST_SHOT,
		cover_image: null,
		date_published: '2018-04-17',
	});
	const lastShotEv = (w: OlWorkFacts | null = work()): WorkCoverEvidence => ({
		editions: { [LAST_SHOT]: { title: 'Star wars', subtitle: 'Last shot', work: LAST_SHOT_WORK } },
		works: { [LAST_SHOT_WORK]: w },
		search: null,
	});
	const children = row({
		id: 'id-cj',
		slug: 'children-of-the-jedi',
		title: 'Children of the Jedi',
		author: ['Barbara Hambly'],
		canon: 'Legends',
		isbn: [CHILDREN],
		primary_isbn: CHILDREN,
		cover_image: null,
		date_published: '1995-04-01',
	});
	const childrenWork = work({
		key: '/works/OL497873W',
		title: 'Star Wars - Children of the Jedi',
		authors: ['Barbara Hambly'],
		covers: [372419],
		first_publish_year: 1995,
		languages: ['eng', 'fre', 'ger'],
	});
	const childrenEv = (search: OlWorkFacts[] = [childrenWork]): WorkCoverEvidence => ({
		editions: { [CHILDREN]: null },
		works: {},
		search,
	});
	const accept = (slug: string, cover: string): CoverReview => ({
		slug,
		cover,
		verdict: 'accept',
		note: 'looked at it',
	});
	const vet = (r: CleanupRow, d: ReturnType<typeof findWorkCover>, over = {}) => {
		if (d.kind !== 'candidate') throw new Error(d.reason);
		return vetFallbackCover(r, d.candidate, {
			headOk: true,
			inUse: new Map(),
			reviews: [accept(r.slug, coverKey(d.candidate.url))],
			...over,
		});
	};

	it('olTitleForm turns OL " - " / " : " separators into ": "', () => {
		expect(olTitleForm('Star Wars - Last Shot - A Han and Lando Novel')).toBe(
			'Star Wars: Last Shot: A Han and Lando Novel',
		);
		expect(olTitleForm('Star Wars : the High Republic')).toBe('Star Wars: the High Republic');
	});

	it('accepts a same-work match: title + full author set, first work cover', () => {
		const d = findWorkCover(lastShot, lastShotEv());
		expect(d).toMatchObject({
			kind: 'candidate',
			candidate: { via: 'same-work', work: LAST_SHOT_WORK, url: LAST_SHOT_URL, isbn: LAST_SHOT },
		});
		expect(vet(lastShot, d)).toMatchObject({ ok: true });
		// Skips OL's non-positive "deleted cover" markers.
		const skip = findWorkCover(lastShot, lastShotEv(work({ covers: [-1, 8568524] })));
		expect(skip.kind === 'candidate' && skip.candidate.cover_id).toBe(8568524);
	});

	it('rejects on author mismatch, including a partial author set', () => {
		const other = findWorkCover(lastShot, lastShotEv(work({ authors: ['Chuck Wendig'] })));
		expect(other).toMatchObject({ kind: 'none' });
		expect(other.kind === 'none' && other.reason).toMatch(/authors \[Chuck Wendig\]/);
		const pair = row({ ...lastShot, author: ['Daniel José Older', 'Chuck Wendig'] });
		expect(findWorkCover(pair, lastShotEv()).kind).toBe('none');
		expect(findWorkCover(row({ ...lastShot, author: [] }), lastShotEv()).kind).toBe('none');
	});

	it('rejects on title mismatch (a series-level work), and a work with no cover', () => {
		const imperial = row({
			slug: 'servants-of-the-empire-imperial-justice',
			title: 'Servants of the Empire: Imperial Justice',
			author: ['Jason Fry'],
			isbn: [IMPERIAL],
			primary_isbn: IMPERIAL,
			cover_image: null,
			date_published: '2015-07-07',
		});
		const series = work({
			key: '/works/OL27832612W',
			title: 'Star Wars Rebels Servants of the Empire',
			authors: ['Jason Fry'],
			covers: [],
		});
		const d = findWorkCover(imperial, {
			editions: { [IMPERIAL]: { title: 'x', subtitle: 'Imperial Justice', work: series.key } },
			works: { [series.key]: series },
			search: null,
		});
		expect(d.kind === 'none' && d.reason).toMatch(/title does not match/);
		const bare = findWorkCover(lastShot, lastShotEv(work({ covers: [] })));
		expect(bare.kind === 'none' && bare.reason).toMatch(/has no cover/);
		expect(findWorkCover(lastShot, lastShotEv(null)).kind).toBe('none');
	});

	it('rejects ambiguous multiple works (search hits, or row ISBNs on two works)', () => {
		const dup = { ...childrenWork, key: '/works/OL999W', covers: [111] };
		const d = findWorkCover(children, childrenEv([childrenWork, dup]));
		expect(d.kind === 'none' && d.reason).toMatch(/ambiguous — 2 works match/);
		// A non-matching extra hit does not make it ambiguous.
		const noise = work({
			key: '/works/OL1W',
			title: 'Sw Children Exp',
			authors: ['Barbara Hambly'],
		});
		expect(findWorkCover(children, childrenEv([childrenWork, noise])).kind).toBe('candidate');
		const two = row({ ...lastShot, isbn: [LAST_SHOT, CHILDREN] });
		const twoWorks = findWorkCover(two, {
			editions: {
				[LAST_SHOT]: { title: null, subtitle: null, work: LAST_SHOT_WORK },
				[CHILDREN]: { title: null, subtitle: null, work: '/works/OL2W' },
			},
			works: { [LAST_SHOT_WORK]: work(), '/works/OL2W': work({ key: '/works/OL2W' }) },
			search: null,
		});
		expect(twoWorks.kind === 'none' && twoWorks.reason).toMatch(/ambiguous/);
	});

	it('title+author search: only when no row ISBN is on OL, and only a plausible work', () => {
		const d = findWorkCover(children, childrenEv());
		expect(d).toMatchObject({
			kind: 'candidate',
			candidate: { via: 'title-author', work: '/works/OL497873W', url: CHILDREN_URL, isbn: null },
		});
		const later = findWorkCover(
			children,
			childrenEv([{ ...childrenWork, first_publish_year: 2004 }]),
		);
		expect(later.kind === 'none' && later.reason).toMatch(/after the row/);
		const canonRow = row({ ...children, canon: 'Canon' });
		expect(findWorkCover(canonRow, childrenEv()).kind).toBe('none'); // 1995 < Canon
		const foreign = { ...childrenWork, languages: ['fre', 'ger'] };
		expect(findWorkCover(children, childrenEv([foreign])).kind).toBe('none');
		const noYear = { ...childrenWork, first_publish_year: null };
		expect(findWorkCover(children, childrenEv([noYear])).kind).toBe('none');
		// An ISBN on OL means same-work only: the search is never consulted.
		const onOl = { ...lastShotEv(work({ covers: [] })), search: [work()] };
		expect(findWorkCover(lastShot, onOl).kind).toBe('none');
	});

	it('rejects a shared cover, a failed HEAD check, an existing cover, and unreviewed images', () => {
		const d = findWorkCover(lastShot, lastShotEv());
		const shared = vet(lastShot, d, { inUse: new Map([['ol:8568524', 'lando']]) });
		expect(shared).toEqual({ ok: false, reason: 'ol:8568524 is already used by lando' });
		// Its own reservation is not "shared".
		expect(vet(lastShot, d, { inUse: new Map([['ol:8568524', 'last-shot']]) }).ok).toBe(true);
		expect(vet(lastShot, d, { headOk: false })).toMatchObject({ ok: false });
		const covered = row({ ...lastShot, cover_image: 'https://example.com/x.jpg' });
		expect(vet(covered, d)).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/never overwritten/),
		});
		const pending = vet(lastShot, d, { reviews: [] });
		expect(pending.ok === false && pending.reason).toMatch(/pending visual review/);
		const rejected = vet(lastShot, d, {
			reviews: [
				{ ...accept('last-shot', 'ol:8568524'), verdict: 'reject', note: 'German edition' },
			],
		});
		expect(rejected.ok === false && rejected.reason).toMatch(/rejected on review: German edition/);
		// A review for a different image does not carry over.
		expect(vet(lastShot, d, { reviews: [accept('last-shot', 'ol:1')] }).ok).toBe(false);
	});

	it('build: fallback only after per-ISBN passes, released rows only, provenance recorded', () => {
		const future = row({ ...lastShot, id: 'id-f', slug: 'm-future', date_published: '2027-01-01' });
		const holder = row({ id: 'id-h', slug: 'holder', cover_image: CHILDREN_URL });
		const kids = row({ ...children, slug: 'kids-copy', id: 'id-k' });
		const cs = buildCleanupChangeset({
			rows: [lastShot, children, future, holder, kids],
			asOf: '2026-10-22',
			isbnEvidence: new Map(),
			coverCandidates: new Map(),
			drafts: { drafts: {}, skipped: {} },
			wikiText: new Map(),
			approvedIsbnAdditions: [],
			isbnHolders: new Map(),
			workCovers: new Map([
				['last-shot', lastShotEv()],
				['children-of-the-jedi', childrenEv()],
				['m-future', lastShotEv()],
				['kids-copy', childrenEv([{ ...childrenWork, covers: [555] }])],
			]),
			fallbackHead: new Map([
				[LAST_SHOT_URL, true],
				[CHILDREN_URL, true],
				['https://covers.openlibrary.org/b/id/555-L.jpg', true],
			]),
			coverReviews: [
				accept('last-shot', 'ol:8568524'),
				accept('children-of-the-jedi', 'ol:372419'),
			],
		});
		const fills = Object.fromEntries(cs.cover_fills.map((c) => [c.slug, c]));
		expect(fills['last-shot']).toMatchObject({
			after: LAST_SHOT_URL,
			source: 'openlibrary-work:OL19653601W',
			fallback: { via: 'same-work', work: LAST_SHOT_WORK, review: 'looked at it' },
		});
		expect(fills['last-shot']?.reason).toMatch(/may be a different printing/);
		// Children's only matching image is already on "holder" — never shared.
		expect(fills['children-of-the-jedi']).toBeUndefined();
		const missing = Object.fromEntries(cs.flagged.covers_missing.map((f) => [f.slug, f.reason]));
		expect(missing['children-of-the-jedi']).toMatch(
			/work-level fallback: ol:372419 is already used by holder/,
		);
		expect(missing['kids-copy']).toMatch(/pending visual review/);
		// Unreleased rows never take a fallback cover.
		expect(cs.flagged.covers_not_yet_available.map((f) => f.slug)).toEqual(['m-future']);
		expect(cs.summary.cover_fills_fallback).toBe(1);

		// Without the holder, the title+author fill is marked as a different edition.
		const solo = buildCleanupChangeset({
			rows: [children],
			asOf: '2026-10-22',
			isbnEvidence: new Map(),
			coverCandidates: new Map([
				// A per-ISBN miss (no URL) falls through to the fallback.
				[
					'children-of-the-jedi',
					[{ isbn: CHILDREN, source: 'openlibrary', url: null, head_ok: false }],
				],
			]),
			drafts: { drafts: {}, skipped: {} },
			wikiText: new Map(),
			approvedIsbnAdditions: [],
			isbnHolders: new Map(),
			workCovers: new Map([['children-of-the-jedi', childrenEv()]]),
			fallbackHead: new Map([[CHILDREN_URL, true]]),
			coverReviews: [accept('children-of-the-jedi', 'ol:372419')],
		});
		expect(solo.cover_fills[0]).toMatchObject({
			source: 'openlibrary-search:title+author:OL497873W',
			fallback: { via: 'title-author' },
		});
		expect(solo.cover_fills[0]?.reason).toMatch(/different edition: title\+author match/);

		// A usable per-ISBN cover wins outright — the fallback is never consulted.
		const perIsbn = 'https://covers.openlibrary.org/b/id/77-L.jpg';
		const won = buildCleanupChangeset({
			rows: [lastShot],
			asOf: '2026-10-22',
			isbnEvidence: new Map(),
			coverCandidates: new Map([
				['last-shot', [{ isbn: LAST_SHOT, source: 'google-books', url: perIsbn, head_ok: true }]],
			]),
			drafts: { drafts: {}, skipped: {} },
			wikiText: new Map(),
			approvedIsbnAdditions: [],
			isbnHolders: new Map(),
			workCovers: new Map([['last-shot', lastShotEv()]]),
			fallbackHead: new Map([[LAST_SHOT_URL, true]]),
			coverReviews: [accept('last-shot', 'ol:8568524')],
		});
		expect(won.cover_fills.map((c) => [c.after, c.fallback])).toEqual([[perIsbn, undefined]]);
	});
});

describe('cleanup apply plan', () => {
	function live(over: Partial<LiveState> = {}): LiveState {
		return {
			id: 'id-qh',
			slug: 'queens-hope',
			title: "Queen's Hope",
			canon: 'Canon',
			isbn: [HOPE_HC],
			primary_isbn: HOPE_PB,
			date_published: '2022-04-05',
			format: [],
			cover_image: null,
			synopsis: null,
			...over,
		};
	}
	const isbnFix = {
		id: 'id-qh',
		slug: 'queens-hope',
		title: "Queen's Hope",
		action: 'add_primary_to_isbn' as const,
		before: { isbn: [HOPE_HC], primary_isbn: HOPE_PB },
		after: { isbn: [HOPE_HC, HOPE_PB], primary_isbn: HOPE_PB },
		reason: '',
		evidence: evidence(),
		approved_additions: [],
		notes: [],
	};
	const synopsis: SynopsisFill = {
		id: 'id-qh',
		slug: 'queens-hope',
		title: "Queen's Hope",
		before: null,
		after: 'Padmé balances her secret marriage with her Senate duties.',
		status: 'drafted',
		basis: 'facts',
		flags: [],
	};
	const coverFill = {
		id: 'id-qh',
		slug: 'queens-hope',
		title: "Queen's Hope",
		before: null,
		after: 'https://covers.openlibrary.org/b/id/9-L.jpg',
		source: 'openlibrary:isbn:x',
		reason: '',
	};
	function cleanup(over: Partial<CleanupChangeset> = {}): CleanupChangeset {
		return {
			kind: 'catalog-cleanup',
			version: 1,
			as_of: '2026-10-21',
			policy: {},
			summary: {
				isbn_fixes: 0,
				isbn_flagged: 0,
				cover_fills: 0,
				cover_fills_fallback: 0,
				covers_missing: 0,
				covers_not_yet_available: 0,
				synopsis_fills: 0,
				synopses_skipped: 0,
			},
			isbn_fixes: [isbnFix],
			cover_fills: [coverFill],
			synopsis_fills: [synopsis],
			flagged: {
				isbn: [],
				covers_missing: [],
				covers_not_yet_available: [],
				synopses_skipped: [],
				synopsis_drafts_unused: [],
			},
			...over,
		};
	}

	it('isbn repair reason lists every added ISBN', () => {
		const both = {
			...isbnFix,
			after: { isbn: [HOPE_HC, HOPE_PB, '9780000000002'], primary_isbn: HOPE_PB },
		};
		expect(planIsbnMembershipFix(both, live()).reason).toBe(`isbn[] += ${HOPE_PB}, 9780000000002`);
	});

	it('isbn repair: apply from before, skip at after, conflict otherwise', () => {
		expect(planIsbnMembershipFix(isbnFix, live()).patch).toEqual({
			isbn: [HOPE_HC, HOPE_PB],
			primary_isbn: HOPE_PB,
		});
		expect(planIsbnMembershipFix(isbnFix, live({ isbn: [HOPE_HC, HOPE_PB] })).action).toBe('skip');
		expect(planIsbnMembershipFix(isbnFix, live({ isbn: ['9780000000002'] })).action).toBe(
			'conflict',
		);
	});

	it('synopsis fill: writes only synopsis, never over existing text, idempotent', () => {
		const s = planSynopsisFill(synopsis, live());
		expect(s.action).toBe('apply');
		expect(s.patch).toEqual({ synopsis: synopsis.after });
		expect(planSynopsisFill(synopsis, live({ synopsis: synopsis.after })).action).toBe('skip');
		expect(planSynopsisFill(synopsis, live({ synopsis: 'Edited by hand.' })).action).toBe(
			'conflict',
		);
		expect(planSynopsisFill(synopsis, live({ slug: 'renamed' })).action).toBe('conflict');
		expect(planSynopsisFill(synopsis, null).action).toBe('conflict');
	});

	it('orders writes: isbn repairs, cover fills, synopsis fills', () => {
		const plan = planCleanup(cleanup(), [live()]);
		expect(plan.map((s) => s.kind)).toEqual(['isbn_fix', 'cover_fix', 'synopsis_fill']);
		expect(plan.every((s) => s.action === 'apply')).toBe(true);
	});

	it('blocks curated-ISBN removal, overwrites, wiki images and shared covers', () => {
		expect(cleanupBlockingProblems(cleanup())).toEqual([]);
		const drop = { ...isbnFix, after: { isbn: [HOPE_PB], primary_isbn: HOPE_PB } };
		expect(cleanupBlockingProblems(cleanup({ isbn_fixes: [drop] })).join()).toMatch(
			/remove curated/,
		);
		// An approved removal covers only the ISBN it names.
		const otherApproved = {
			...drop,
			approved_removals: [{ slug: 'queens-hope', isbn: '9780000000002', owner: 'y', note: '' }],
		};
		expect(cleanupBlockingProblems(cleanup({ isbn_fixes: [otherApproved] })).join()).toMatch(
			/remove curated/,
		);
		const approved = {
			...drop,
			approved_removals: [{ slug: 'queens-hope', isbn: HOPE_HC, owner: 'y', note: '' }],
		};
		expect(cleanupBlockingProblems(cleanup({ isbn_fixes: [approved] }))).toEqual([]);
		expect(planIsbnMembershipFix(approved, live()).reason).toBe(
			`isbn[] += ${HOPE_PB}; isbn[] -= ${HOPE_HC}`,
		);
		const overwrite = { ...synopsis, before: 'Existing.' };
		expect(cleanupBlockingProblems(cleanup({ synopsis_fills: [overwrite] })).join()).toMatch(
			/overwrite/,
		);
		const wiki = { ...coverFill, after: 'https://static.wikia.nocookie.net/starwars/images/x.jpg' };
		expect(cleanupBlockingProblems(cleanup({ cover_fills: [wiki] })).join()).toMatch(
			/Wookieepedia/,
		);
		const twin = { ...coverFill, id: 'id-2', slug: 'other' };
		expect(cleanupBlockingProblems(cleanup({ cover_fills: [coverFill, twin] })).join()).toMatch(
			/reuses/,
		);
		expect(cleanupBlockingProblems(cleanup({ version: 9 })).join()).toMatch(/version/);
	});
});
