import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bookRowLabel } from '@/lib/book-a11y';

// #271: the list row shows the series name (no "SERIES" label) under the author, moves the
// Canon/Legends badge into the data column, and drops the format. Source-level so it runs
// without a React Native renderer.
const source = readFileSync(resolve(__dirname, 'book-card.tsx'), 'utf8');
const a11ySource = readFileSync(resolve(__dirname, '..', 'lib', 'book-a11y.ts'), 'utf8');

const dataColumnAt = source.indexOf('style={styles.data}');

describe('book-card content (#271)', () => {
	it('has a data column', () => {
		expect(dataColumnAt).toBeGreaterThan(-1);
	});

	it('drops the SERIES label but still renders the series name', () => {
		expect(source).not.toMatch(/'SERIES'/);
		expect(source).toMatch(/\{\s*book\.series_name\s*\}/);
	});

	it('renders the series name in the leading column, before the data column', () => {
		const seriesAt = source.search(/\{\s*book\.series_name\s*\}/);
		expect(seriesAt).toBeGreaterThan(-1);
		expect(seriesAt).toBeLessThan(dataColumnAt);
	});

	it('truncates the series name instead of growing the row', () => {
		expect(source).toMatch(
			/style=\{\s*styles\.series\s*\}\s*numberOfLines=\{\s*[12]\s*\}[^>]*>\s*\{\s*book\.series_name\s*\}/,
		);
	});

	it('renders the canon badge inside the data column', () => {
		const badgeAt = source.indexOf('<CanonBadge');
		expect(badgeAt).toBeGreaterThan(dataColumnAt);
		expect(source.match(/<CanonBadge/g)).toHaveLength(1);
	});

	it('removes the format label and value', () => {
		expect(source).not.toMatch(/'FORMAT'/);
		expect(source).not.toMatch(/\bformat\b/);
	});

	it('keeps the timeline data point', () => {
		expect(source).toMatch(/'TIMELINE'|>\s*TIMELINE\s*</);
		expect(source).toMatch(/eraLabel\(\s*book\.timeline_order\s*\)/);
	});
});

describe('bookRowLabel series (#271)', () => {
	it('speaks the series between the byline and the canon status', () => {
		expect(
			bookRowLabel({
				title: 'Light of the Jedi',
				author: ['Charles Soule'],
				canon: 'Canon',
				series_name: 'The High Republic (Phase I)',
			}),
		).toBe('Light of the Jedi by Charles Soule, The High Republic (Phase I), Canon');
	});

	it('leaves no dangling comma for a standalone book', () => {
		expect(bookRowLabel({ title: 'X', author: ['Y'], canon: 'Legends', series_name: null })).toBe(
			'X by Y, Legends',
		);
		expect(bookRowLabel({ title: 'X', author: ['Y'], canon: 'Legends', series_name: '' })).toBe(
			'X by Y, Legends',
		);
	});

	it('never announces the removed format', () => {
		expect(a11ySource).not.toMatch(/\bformat\b/);
	});
});
