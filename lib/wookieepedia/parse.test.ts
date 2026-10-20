import { describe, expect, it } from 'vitest';
import {
	cleanTitle,
	normalizeIsbn,
	parseBookInfobox,
	parseTimeline,
	parseWikiDate,
	stripWikiMarkup,
} from './parse';

describe('stripWikiMarkup', () => {
	it('unwraps links, drops refs and bold/italic', () => {
		expect(stripWikiMarkup("'''[[Charles Soule]]'''<ref name=\"x\" />")).toBe('Charles Soule');
		expect(stripWikiMarkup('[[Del Rey|Del Rey Books]]')).toBe('Del Rey Books');
	});

	it('drops a full <ref>…</ref> including nested template content', () => {
		expect(stripWikiMarkup('[[January 5]], [[2021]]<ref name="p">{{Cite|a=b}}</ref>')).toBe(
			'January 5, 2021',
		);
	});
});

describe('parseWikiDate', () => {
	it('parses a linked wiki date to ISO', () => {
		expect(parseWikiDate('[[April 11]], [[2017]]')).toBe('2017-04-11');
		expect(parseWikiDate('[[January 5]], [[2021]]')).toBe('2021-01-05');
	});

	it('strips a circa qualifier and trailing refs', () => {
		expect(parseWikiDate('[[January 5]], [[2021]]<ref name="p" />')).toBe('2021-01-05');
	});

	it('returns null when unparseable', () => {
		expect(parseWikiDate('')).toBeNull();
		expect(parseWikiDate('forthcoming')).toBeNull();
	});
});

describe('parseTimeline', () => {
	it('maps BBY to negative and ABY to positive', () => {
		expect(parseTimeline('c. [[15 BBY]]')).toBe(-15);
		expect(parseTimeline('[[2 ABY]]')).toBe(2);
		expect(parseTimeline('232 BBY')).toBe(-232);
	});

	it('takes the start of a range', () => {
		expect(parseTimeline('[[19 BBY]]–[[18 BBY]]')).toBe(-19);
	});

	it('returns null without a BBY/ABY token', () => {
		expect(parseTimeline('unknown')).toBeNull();
		expect(parseTimeline('')).toBeNull();
	});
});

describe('normalizeIsbn (reused from lib/isbn)', () => {
	it('is idempotent on a valid ISBN-13', () => {
		expect(normalizeIsbn('9780593157718')).toBe('9780593157718');
	});

	it('converts a valid ISBN-10 to ISBN-13', () => {
		// 0-345-38400-4 → prepend 978, recompute check digit → 978-0-345-38400-3
		expect(normalizeIsbn('0345384004')).toBe('9780345384003');
	});

	it('strips hyphens and spaces', () => {
		expect(normalizeIsbn('978-0-593-15771-8')).toBe('9780593157718');
	});

	it('rejects an invalid ISBN', () => {
		expect(normalizeIsbn('9780593157710')).toBeNull(); // bad check digit
		expect(normalizeIsbn('1234')).toBeNull();
		expect(normalizeIsbn('not-an-isbn')).toBeNull();
	});
});

describe('cleanTitle', () => {
	it('strips a trailing disambiguation parenthetical', () => {
		expect(cleanTitle('Darth Bane: Path of Destruction (novel)')).toBe(
			'Darth Bane: Path of Destruction',
		);
		expect(cleanTitle('Light of the Jedi')).toBe('Light of the Jedi');
	});
});

describe('parseBookInfobox', () => {
	const wikitext = [
		'{{Book',
		"|title=''Light of the Jedi''",
		'|author=[[Charles Soule]]<ref name="p">{{Cite|url=x}}</ref>',
		'|publisher=[[Del Rey]]',
		'|release date=[[January 5]], [[2021]]',
		'|isbn=9780593157718',
		'|timeline=[[232 BBY]]',
		'}}',
		'',
		"'''Light of the Jedi''' is a novel.",
	].join('\n');

	it('extracts fields, ignoring pipes inside nested templates and links', () => {
		const fields = parseBookInfobox(wikitext);
		expect(fields).not.toBeNull();
		expect(fields?.author).toContain('Charles Soule');
		expect(fields?.publisher).toBe('[[Del Rey]]');
		expect(fields?.isbn).toBe('9780593157718');
		expect(fields?.['release date']).toBe('[[January 5]], [[2021]]');
	});

	it('returns null when there is no {{Book}} template', () => {
		expect(parseBookInfobox('A disambiguation page. {{Disambig}}')).toBeNull();
	});
});
