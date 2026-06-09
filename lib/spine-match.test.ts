import type { Book } from '@/lib/hooks';
import {
	MATCH_CONSTANTS,
	type OcrFragment,
	buildCatalogIndex,
	classifyConfidence,
	matchFragments,
	normalizeTokens,
} from '@/lib/spine-match';
import { describe, expect, it } from 'vitest';

// Minimal Book factory — only the fields the matcher reads matter; the rest are cast away.
let nextId = 0;
function book(partial: Partial<Book> & { title: string }): Book {
	nextId += 1;
	return {
		id: partial.id ?? `book-${nextId}`,
		author: [],
		series_name: null,
		format: null,
		primary_isbn: null,
		timeline_order: null,
		...partial,
	} as Book;
}

const frags = (...texts: string[]): OcrFragment[] => texts.map((text) => ({ text }));

// A small Star Wars catalog with the shared-franchise-word problem baked in.
const CATALOG: Book[] = [
	book({ id: 'heir', title: 'Heir to the Empire', author: ['Timothy Zahn'] }),
	book({ id: 'dfr', title: 'Dark Force Rising', author: ['Timothy Zahn'] }),
	book({ id: 'tlc', title: 'The Last Command', author: ['Timothy Zahn'] }),
	book({ id: 'thrawn', title: 'Thrawn', author: ['Timothy Zahn'] }),
	book({ id: 'asc-chaos', title: 'Thrawn Ascendancy Chaos Rising', author: ['Timothy Zahn'] }),
	book({ id: 'asc-greater', title: 'Thrawn Ascendancy Greater Good', author: ['Timothy Zahn'] }),
	book({ id: 'bane', title: 'Darth Bane Path of Destruction', author: ['Drew Karpyshyn'] }),
	book({ id: 'plagueis', title: 'Darth Plagueis', author: ['James Luceno'] }),
	book({ id: 'dawn', title: 'A New Dawn', author: ['John Jackson Miller'] }),
];

const index = buildCatalogIndex(CATALOG);
const ids = (matches: { book: Book }[]) => matches.map((m) => m.book.id);

describe('normalizeTokens', () => {
	it.each([
		['Heir to the Empire', ['heir', 'empire']],
		['DARTH BANE', ['darth', 'bane']],
		['Thrawn: Alliances', ['thrawn', 'alliances']],
		['The Last of the Jedi', ['last', 'jedi']],
		['Padmé', ['padme']], // diacritics stripped via NFKD
		['Episode 2', ['episode']], // single chars (incl. lone digits) dropped
	])('normalizes %j', (input, expected) => {
		expect(normalizeTokens(input)).toEqual(expected);
	});
});

describe('classifyConfidence', () => {
	const { HIGH_SCORE, HIGH_MARGIN, LOW_SCORE } = MATCH_CONSTANTS;
	it.each([
		[0.7, 0.2, 'high'], // strong score + clear margin
		[HIGH_SCORE, HIGH_MARGIN, 'high'], // exact boundary is inclusive
		[0.7, 0.05, 'low'], // strong score but ambiguous near-tie → double-check
		[0.5, 0.5, 'low'], // mid score
		[LOW_SCORE, 1, 'low'], // low boundary inclusive
		[0.3, 0.9, null], // below the floor → rejected
		[LOW_SCORE - 0.01, 1, null],
	])('classifies score=%d margin=%d → %s', (score, margin, expected) => {
		expect(classifyConfidence(score, margin)).toBe(expected);
	});
});

describe('matchFragments — recognition', () => {
	it('matches a clean full title (+author) at high confidence', () => {
		const matches = matchFragments(frags('Heir to the Empire Timothy Zahn'), index);
		expect(matches[0].book.id).toBe('heir');
		expect(matches[0].bucket).toBe('high');
	});

	it('matches a distinctive title without the author present', () => {
		const matches = matchFragments(frags('Dark Force Rising'), index);
		expect(matches[0].book.id).toBe('dfr');
		expect(matches[0].bucket).toBe('high');
	});

	it('disambiguates among titles sharing franchise words', () => {
		// "Darth" appears in two titles, "Bane" in one — the full title must win cleanly.
		const matches = matchFragments(frags('Darth Bane Path of Destruction'), index);
		expect(matches[0].book.id).toBe('bane');
		expect(ids(matches)).not.toContain('plagueis');
	});
});

describe('matchFragments — title-coverage floor', () => {
	it('rejects a single shared distinctive token (no title coverage)', () => {
		// "Darth" alone covers <2 title tokens for both Darth books → nothing surfaces.
		expect(matchFragments(frags('Darth'), index)).toHaveLength(0);
	});

	it('rejects a lone rare token that does not cover the title', () => {
		// "Plagueis" alone is 1 of 2 title tokens → below the floor.
		expect(matchFragments(frags('Plagueis'), index)).toHaveLength(0);
	});

	it('matches once the title is actually covered', () => {
		const matches = matchFragments(frags('Darth Plagueis'), index);
		expect(matches[0].book.id).toBe('plagueis');
	});
});

describe('matchFragments — aggregation & dedupe', () => {
	it('pools tokens across fragments (wrapped/split spine text)', () => {
		// Title split across two OCR lines still resolves.
		const matches = matchFragments(frags('Darth', 'Plagueis'), index);
		expect(matches[0].book.id).toBe('plagueis');
		expect(matches[0].supports).toBe(2); // both lines corroborate
	});

	it('dedupes a book seen in overlapping photos into one match', () => {
		const matches = matchFragments(frags('Heir to the Empire', 'Heir Empire Zahn'), index);
		expect(ids(matches).filter((id) => id === 'heir')).toHaveLength(1);
		expect(matches.find((m) => m.book.id === 'heir')?.supports).toBe(2);
	});
});

describe('matchFragments — confidence & alternates', () => {
	it('keeps the fuller match high and rejects a partial-overlap competitor', () => {
		// "Chaos Rising" is clearly present; the "Greater Good" sibling shares only the
		// "Thrawn Ascendancy" prefix and is correctly dropped (precision over recall).
		const matches = matchFragments(frags('Thrawn Ascendancy Chaos Rising'), index);
		const chaos = matches.find((m) => m.book.id === 'asc-chaos');
		expect(chaos?.bucket).toBe('high');
		expect(ids(matches)).not.toContain('asc-greater');
	});

	it('demotes a genuine near-tie to "double-check" and cross-lists alternates', () => {
		// Two works that share a title token and both score fully → ambiguous → both `low`,
		// each offered as the other's swap alternative.
		const ambiguous = [
			book({ id: 'd-empire', title: 'Dark Empire', author: [] }),
			book({ id: 'd-times', title: 'Dark Times', author: [] }),
		];
		const idx = buildCatalogIndex(ambiguous);
		const matches = matchFragments(frags('Dark Empire Dark Times'), idx);

		expect(matches).toHaveLength(2);
		expect(matches.every((m) => m.bucket === 'low')).toBe(true);
		const empire = matches.find((m) => m.book.id === 'd-empire');
		expect(empire?.alternates.map((a) => a.book.id)).toContain('d-times');
	});
});

describe('buildCatalogIndex — edition collapse', () => {
	it('collapses editions of one work and keeps the preferred row', () => {
		const editions = [
			book({ id: 'tw-pb', title: 'Thrawn', author: ['Timothy Zahn'], format: ['paperback'] }),
			book({
				id: 'tw-hc',
				title: 'Thrawn',
				author: ['Timothy Zahn'],
				format: ['hardcover'],
				primary_isbn: '9780101',
			}),
		];
		const idx = buildCatalogIndex(editions);
		expect(idx.size).toBe(1);
		// primary_isbn present wins the tie-break.
		expect(matchFragments(frags('Thrawn Timothy Zahn'), idx)[0].book.id).toBe('tw-hc');
	});

	it('does not merge two distinct authorless works with the same title', () => {
		const authorless = [
			book({ id: 'a1', title: 'Aftermath', author: [] }),
			book({ id: 'a2', title: 'Aftermath', author: [] }),
		];
		expect(buildCatalogIndex(authorless).size).toBe(2);
	});
});
