import { describe, expect, it } from 'vitest';
import type { AudienceSignal } from '../sources/lookup';
import { decideType, hitMatchesBook, labelOf } from './audience';
import { isCanceledPage, wikiDatePrecision } from './parse';

const book = { title: 'Tatooine Ghost', author: ['Troy Denning'] };
const sig = (over: Partial<AudienceSignal>): AudienceSignal => ({
	source: 'google-books',
	via: 'search',
	matchedTitle: 'Tatooine Ghost: Star Wars Legends',
	matchedAuthors: ['Troy Denning'],
	labels: ['Fiction'],
	...over,
});

describe('audience → type', () => {
	it('labels BISAC / OL subjects', () => {
		expect(labelOf(sig({ labels: ['Fiction'] }))).toBe('adult');
		expect(labelOf(sig({ labels: ['Young Adult Fiction'] }))).toBe('ya');
		expect(labelOf(sig({ labels: ['Juvenile Fiction'] }))).toBe('juvenile');
		expect(labelOf(sig({ labels: ['Comics & Graphic Novels'] }))).toBeNull();
		expect(labelOf(sig({ source: 'open-library', labels: ['Science fiction'] }))).toBe('adult');
	});

	it('only counts a search hit that is the same book', () => {
		expect(hitMatchesBook(sig({}), book)).toBe(true);
		expect(hitMatchesBook(sig({ matchedAuthors: ['Someone Else'] }), book)).toBe(false);
		expect(hitMatchesBook(sig({ matchedTitle: 'Star Wars Year By Year' }), book)).toBe(false);
	});

	it('decides only on one consistent label; Google Books outranks Open Library', () => {
		expect(decideType([sig({})], book).type).toBe('Adult Novel');
		expect(decideType([sig({ labels: ['Young Adult Fiction'] })], book).type).toBe('YA Novel');
		expect(decideType([sig({ labels: ['Juvenile Fiction'] })], book).type).toBeNull();
		expect(decideType([sig({}), sig({ labels: ['Juvenile Fiction'] })], book).type).toBeNull();
		expect(decideType([], book).type).toBeNull();
		// OL's work-level "Juvenile fiction" subject doesn't override GB's BISAC.
		const olJuvenile = sig({ source: 'open-library', via: 'isbn', labels: ['Juvenile fiction'] });
		expect(decideType([olJuvenile, sig({})], book).type).toBe('Adult Novel');
		// A rejected (wrong-book) hit contributes nothing.
		const wrong = sig({ matchedTitle: 'Another Book', labels: ['Young Adult Fiction'] });
		expect(decideType([wrong], book).type).toBeNull();
	});
});

describe('wikiDatePrecision', () => {
	it('distinguishes day / month / year release dates', () => {
		expect(wikiDatePrecision('[[May 4]], [[2017]]')).toBe('day');
		expect(wikiDatePrecision('[[February]] [[1996]]')).toBe('month');
		expect(wikiDatePrecision('c. [[1996]]')).toBe('year');
		expect(wikiDatePrecision('2002-10-01')).toBe('day');
		expect(wikiDatePrecision('TBA')).toBeNull();
	});
});

describe('isCanceledPage', () => {
	it('detects the {{Canceled}} template (either spelling), not prose or comments', () => {
		expect(isCanceledPage('{{Top|leg}}\n{{Canceled|novels}}\n{{Book')).toBe(true);
		expect(isCanceledPage('{{Cancelled}}')).toBe(true);
		expect(isCanceledPage('The sequel was canceled in 2004.')).toBe(false);
		expect(isCanceledPage('<!-- {{Canceled|novels}} -->')).toBe(false);
		expect(isCanceledPage('{{CanceledFoo}}')).toBe(false);
	});
});
