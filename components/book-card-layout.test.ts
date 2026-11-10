import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #149: books are the hero, so the cover must outweigh the row's data column, and the
// data labels must stay legible. Source-level so it runs without a React Native renderer.
const source = readFileSync(resolve(__dirname, 'book-card.tsx'), 'utf8');

/** A numeric style prop inside a `name: { ... }` StyleSheet block. */
function styleNumber(block: string, prop: string): number | null {
	const body = source.match(new RegExp(`\\b${block}:\\s*\\{([^}]*)\\}`))?.[1] ?? '';
	const value = body.match(new RegExp(`\\b${prop}:\\s*(\\d+(?:\\.\\d+)?)`))?.[1];
	return value == null ? null : Number(value);
}

function constNumber(pattern: RegExp): number | null {
	const value = source.match(pattern)?.[1];
	return value == null ? null : Number(value);
}

const coverWidth =
	constNumber(/BOOK_CARD_COVER\s*=\s*\{\s*width:\s*(\d+)/) ??
	constNumber(/<HoloCover[\s\S]*?width=\{(\d+)\}/);
const coverHeight =
	constNumber(/BOOK_CARD_COVER\s*=\s*\{[^}]*height:\s*(\d+)/) ??
	constNumber(/<HoloCover[\s\S]*?height=\{(\d+)\}/);
const dataWidth = constNumber(/BOOK_CARD_DATA_WIDTH\s*=\s*(\d+)/) ?? styleNumber('data', 'width');

describe('book-card layout (#149)', () => {
	it('renders the cover from the shared size constant', () => {
		expect(source).toMatch(/width=\{\s*BOOK_CARD_COVER\.width\s*\}/);
		expect(source).toMatch(/height=\{\s*BOOK_CARD_COVER\.height\s*\}/);
	});

	it('sizes the data column from its constant', () => {
		expect(source).toMatch(/width:\s*BOOK_CARD_DATA_WIDTH\b/);
	});

	it('keeps the cover 2:3', () => {
		expect(coverWidth).not.toBeNull();
		expect(coverHeight).not.toBeNull();
		expect((coverHeight ?? 0) / (coverWidth ?? 1)).toBeCloseTo(1.5, 2);
	});

	it('makes the cover wider than the data column', () => {
		expect(dataWidth).not.toBeNull();
		expect(coverWidth ?? 0).toBeGreaterThan(dataWidth ?? Number.POSITIVE_INFINITY);
	});

	it('keeps data labels at 11pt or larger', () => {
		expect(styleNumber('dataLabel', 'fontSize') ?? 0).toBeGreaterThanOrEqual(11);
	});

	it('sets data values at 13pt', () => {
		expect(styleNumber('dataValue', 'fontSize')).toBe(13);
	});

	it('pads the data column 12pt from its divider', () => {
		expect(styleNumber('data', 'paddingLeft')).toBe(12);
	});
});
