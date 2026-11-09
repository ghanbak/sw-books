import { describe, expect, it } from 'vitest';

import type { Book } from '@/lib/hooks';
import { normalizeQuery, searchBooks } from './search';

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
});
