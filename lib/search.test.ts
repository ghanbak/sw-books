import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Book } from '@/lib/hooks';
import { normalizeQuery, searchBooks, swapCandidates } from './search';

function book(overrides: Partial<Book>): Book {
	return {
		title: '',
		author: [],
		series_name: null,
		slug: '',
		...overrides,
	} as Book;
}

const CATALOG: Book[] = [
	book({ title: 'I, Jedi', author: ['Michael A. Stackpole'], slug: 'i-jedi' }),
	book({
		title: 'Heir to the Empire',
		author: ['Timothy Zahn'],
		series_name: 'Thrawn Trilogy',
		slug: 'heir-to-the-empire',
	}),
	book({
		title: 'Darth Bane: Path of Destruction',
		author: ['Drew Karpyshyn'],
		slug: 'path-of-destruction',
	}),
];

describe('normalizeQuery', () => {
	it('lowercases and collapses punctuation to single spaces', () => {
		expect(normalizeQuery('I, Jedi')).toBe('i jedi');
		expect(normalizeQuery('  Heir---to  ')).toBe('heir to');
	});

	it('folds precomposed and decomposed diacritics to the same form', () => {
		expect(normalizeQuery('Daniel José Older')).toBe('daniel jose older');
		expect(normalizeQuery('Daniel José Older')).toBe('daniel jose older');
	});

	it.each([
		['straight', "Razor's Edge"],
		['curly', 'Razor’s Edge'],
		['opening curly', 'Razor‘s Edge'],
		['modifier letter', 'Razorʼs Edge'],
	])('deletes a %s apostrophe instead of breaking the word', (_kind, input) => {
		expect(normalizeQuery(input)).toBe('razors edge');
	});

	it.each(['a c crispin', 'ac crispin', 'A.C. Crispin', 'A. C. Crispin'])(
		'merges initials in %j',
		(input) => {
			expect(normalizeQuery(input)).toBe('ac crispin');
		},
	);

	it('leaves a lone single letter alone', () => {
		expect(normalizeQuery('I, Jedi')).toBe('i jedi');
		expect(normalizeQuery('X-Wing')).toBe('x wing');
		expect(normalizeQuery('Michael A. Stackpole')).toBe('michael a stackpole');
	});

	it('does not merge digits with letters', () => {
		expect(normalizeQuery('Volume 1 2')).toBe('volume 1 2');
		expect(normalizeQuery('a 1 b')).toBe('a 1 b');
	});
});

describe('searchBooks', () => {
	it('returns [] for an empty/whitespace query', () => {
		expect(searchBooks(CATALOG, '')).toEqual([]);
		expect(searchBooks(CATALOG, '   ')).toEqual([]);
	});

	it('matches title regardless of punctuation', () => {
		expect(searchBooks(CATALOG, 'i jedi').map((b) => b.title)).toEqual(['I, Jedi']);
	});

	it('matches author and series', () => {
		expect(searchBooks(CATALOG, 'zahn').map((b) => b.title)).toEqual(['Heir to the Empire']);
		expect(searchBooks(CATALOG, 'thrawn').map((b) => b.title)).toEqual(['Heir to the Empire']);
	});

	it('matches the slug', () => {
		expect(searchBooks(CATALOG, 'path of destruction').map((b) => b.title)).toEqual([
			'Darth Bane: Path of Destruction',
		]);
	});

	it('returns [] when nothing matches', () => {
		expect(searchBooks(CATALOG, 'mandalorian')).toEqual([]);
	});

	it('matches a punctuated query against the slug alone', () => {
		const onlySlug = book({ title: 'Untitled', slug: 'i-jedi' });
		expect(searchBooks([onlySlug], 'I, Jedi')).toEqual([onlySlug]);
	});

	describe.each([
		['precomposed', 'Daniel José Older'],
		['decomposed', 'Daniel José Older'],
	])('with a %s accented author', (_form, author) => {
		const accented = book({
			title: 'Midnight Horizon',
			author: [author],
			slug: 'midnight-horizon',
		});

		it.each(['jose', 'José', 'José', 'Daniel Jose Older', 'Daniel José Older'])(
			'matches %j',
			(query) => {
				expect(searchBooks([accented], query)).toEqual([accented]);
			},
		);
	});

	describe('punctuation-free queries', () => {
		const razor = book({ title: "Razor's Edge", author: ['Martha Wells'], slug: 'razor-s-edge' });
		const crispin = book({
			title: 'The Paradise Snare',
			author: ['A.C. Crispin'],
			slug: 'the-paradise-snare',
		});

		it.each(['razors edge', "razor's edge", 'Razor’s Edge', 'razor s edge'])(
			'finds the apostrophe title from %j',
			(query) => {
				expect(searchBooks([razor], query)).toEqual([razor]);
			},
		);

		it.each(['ac crispin', 'a c crispin', 'A.C. Crispin', 'A. C. Crispin'])(
			'finds the initialed author from %j',
			(query) => {
				expect(searchBooks([crispin], query)).toEqual([crispin]);
			},
		);
	});

	describe('queries that matched the literal word breaks', () => {
		const edge = book({
			title: "Galaxy's Edge: A Crash of Fate",
			slug: 'a-crash-of-fate',
		});
		const kemp = book({ title: 'Crosscurrent', author: ['Paul S. Kemp'], slug: 'crosscurrent' });
		const dawn = book({ title: 'A New Dawn', slug: 'a-new-dawn' });

		it('still finds an apostrophe title typed with a space', () => {
			expect(searchBooks([edge], 'galaxy s edge')).toEqual([edge]);
		});

		it('keeps results while the next word after an initial is being typed', () => {
			expect(searchBooks([kemp], 'paul s k')).toEqual([kemp]);
			expect(searchBooks([kemp], 'Paul S. K')).toEqual([kemp]);
			expect(searchBooks([dawn], 'a n')).toEqual([dawn]);
		});
	});
});

describe('swapCandidates', () => {
	const queen = book({
		id: 'queen',
		title: "Queen's Peril",
		author: ['E. K. Johnston'],
		slug: 'queens-peril',
	});
	const midnight = book({
		id: 'midnight',
		title: 'Midnight Horizon',
		author: ['Daniel José Older'],
		slug: 'midnight-horizon',
	});
	const midnightDecomposed = book({
		id: 'midnight-nfd',
		title: 'Race to Crashpoint Tower',
		author: ['Daniel José Older'],
		slug: 'race-to-crashpoint-tower',
	});
	const none: ReadonlySet<string> = new Set();

	it('finds an apostrophe title typed without the apostrophe', () => {
		expect(swapCandidates([queen, midnight], 'queens peril', none)).toEqual([queen]);
	});

	it('finds precomposed and decomposed accented authors from an unaccented query', () => {
		expect(swapCandidates([queen, midnight, midnightDecomposed], 'jose', none)).toEqual([
			midnight,
			midnightDecomposed,
		]);
	});

	it('excludes taken ids', () => {
		expect(swapCandidates([queen, midnight], 'e', new Set(['queen', 'midnight']))).toEqual([]);
		expect(swapCandidates([queen, midnight], 'jose', new Set(['queen']))).toEqual([midnight]);
		expect(swapCandidates([queen, midnight], 'jose', new Set(['midnight']))).toEqual([]);
	});

	it('caps at 12 after removing taken ids', () => {
		const many = Array.from({ length: 20 }, (_, i) =>
			book({ id: `b${i}`, title: `Rogue ${i}`, slug: `rogue-${i}` }),
		);
		const result = swapCandidates(many, 'rogue', new Set(['b0', 'b1']));
		expect(result).toHaveLength(12);
		expect(result[0]?.id).toBe('b2');
		expect(result[11]?.id).toBe('b13');
	});

	it('returns [] for a query that normalizes to nothing', () => {
		expect(swapCandidates([queen], "'...", none)).toEqual([]);
	});

	it('is what the SwapSheet search branch calls', () => {
		const source = readFileSync(resolve(__dirname, '../components/shelf-scan-review.tsx'), 'utf8');
		expect(source).toMatch(/swapCandidates\(\s*books,\s*query,\s*takenIds,?\s*\)/);
		expect(source).toMatch(/import \{[^}]*\bswapCandidates\b[^}]*\} from '@\/lib\/search'/);
		expect(source).not.toMatch(/\.toLowerCase\(\)\.includes\(q\)/);
	});
});
