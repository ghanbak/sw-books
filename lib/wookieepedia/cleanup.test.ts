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
	type IsbnEvidence,
	type SynopsisFill,
	applyApprovedAdditions,
	buildCleanupChangeset,
	coverIsbns,
	coverKey,
	decideIsbnMembership,
	isWikiImage,
	olNamesBook,
	pickCover,
	pickResetPrimary,
	sharedPhrases,
	synopsisProblems,
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
