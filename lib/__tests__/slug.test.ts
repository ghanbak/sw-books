import { describe, expect, it } from 'vitest';
import { ensureUniqueSlug, slugify } from '../slug';

describe('slugify', () => {
	it.each([
		["Queen's Peril", 'queens-peril'],
		["Aftermath: Empire's End", 'aftermath-empires-end'],
		['Master & Apprentice', 'master-and-apprentice'],
		['X-Wing: Rogue Squadron', 'x-wing-rogue-squadron'],
		['Light of the Jedi', 'light-of-the-jedi'],
		['Café Toketék', 'cafe-toketek'],
		['  Trailing  spaces  ', 'trailing-spaces'],
		['Heir to the Empire (Legends)', 'heir-to-the-empire-legends'],
	])('slugifies %j → %j', (title, expected) => {
		expect(slugify(title)).toBe(expected);
	});

	it('drops curly apostrophes the same as straight ones', () => {
		expect(slugify('Empire’s End')).toBe('empires-end');
	});

	it('returns empty string for punctuation-only titles', () => {
		expect(slugify('!!!')).toBe('');
	});
});

describe('ensureUniqueSlug', () => {
	it('returns the base slug when it is free', () => {
		expect(ensureUniqueSlug('thrawn', ['light-of-the-jedi'])).toBe('thrawn');
	});

	it('suffixes -2, -3 on collision', () => {
		expect(ensureUniqueSlug('thrawn', ['thrawn'])).toBe('thrawn-2');
		expect(ensureUniqueSlug('thrawn', ['thrawn', 'thrawn-2'])).toBe('thrawn-3');
	});

	it('accepts a Set', () => {
		expect(ensureUniqueSlug('a', new Set(['a', 'a-2']))).toBe('a-3');
	});
});
