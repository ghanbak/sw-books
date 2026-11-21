import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Vitest is node-only (no render tests), so assert the wiring in source: each small target
// passes its slop to `hitSlop`, and its parent grows by the same slop (child hitSlop can't
// reach past the parent's bounds in native hit-testing).
function source(rel: string): string {
	return readFileSync(resolve(__dirname, '..', rel), 'utf8');
}

function count(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

describe('tap-target wiring', () => {
	it('filter pills pass the vertical slop and grow the row', () => {
		const src = source('components/ui/filter-pills.tsx');
		expect(count(src, 'hitSlop={FILTER_PILL_HIT_SLOP}')).toBe(1);
		expect(count(src, 'slopBoundsStyle(FILTER_PILL_HIT_SLOP)')).toBe(1);
	});

	it('both added-books sheet icon buttons pass the slop and grow the header', () => {
		const src = source('components/added-books-sheet.tsx');
		expect(count(src, 'hitSlop={SHEET_ICON_BUTTON_HIT_SLOP}')).toBe(2);
		expect(count(src, 'slopBoundsStyle(SHEET_ICON_BUTTON_HIT_SLOP)')).toBe(1);
	});

	// #357: the card title "See all" link hugged by its row, under the card's overflow clip,
	// with the first character row rendered after it (so hit-tested first).
	describe('card title "See all" link', () => {
		function cardSource(): string {
			try {
				return source('components/ui/card.tsx');
			} catch {
				return '';
			}
		}

		function between(src: string, start: string, end: string): string {
			const a = src.indexOf(start);
			const b = a === -1 ? -1 : src.indexOf(end, a);
			return a === -1 || b === -1 ? '' : src.slice(a, b);
		}

		const src = cardSource();
		const cardTitle = between(
			src,
			'export function CardTitle(',
			'const styles = StyleSheet.create(',
		);
		const linkRow = between(src, 'linkRow: {', '},');

		it('finds CardTitle and the linkRow style', () => {
			expect(cardTitle).not.toBe('');
			expect(linkRow).not.toBe('');
		});

		it('sizes the slop to 44pt with the top capped at the card padding', () => {
			expect(src).toMatch(
				/LINK_HIT_SLOP\s*=\s*\{\s*\.\.\.cappedVerticalHitSlop\(\s*TITLE_LINE_HEIGHT,\s*CARD_PADDING\s*\)/,
			);
		});

		it('passes the slop to the link and grows its row by the same slop', () => {
			expect(count(cardTitle, 'hitSlop={LINK_HIT_SLOP}')).toBe(1);
			expect(cardTitle).toMatch(/\[\s*styles\.titleRow,\s*styles\.linkRow\s*\]/);
			expect(linkRow).toMatch(/\.\.\.slopBoundsStyle\(\s*LINK_HIT_SLOP\s*\)/);
		});

		it('keeps the row layout-neutral (its 4pt bottom padding survives the slop)', () => {
			expect(linkRow).toMatch(
				/paddingBottom:\s*TITLE_ROW_PADDING_BOTTOM\s*\+\s*LINK_HIT_SLOP\.bottom/,
			);
			expect(src).toMatch(/paddingBottom:\s*TITLE_ROW_PADDING_BOTTOM\b/);
		});

		it('hit-tests the row before the following character row without swallowing it', () => {
			expect(linkRow).toMatch(/zIndex:\s*1\b/);
			expect(cardTitle).toMatch(/pointerEvents=\{\s*hasLink\s*\?\s*'box-none'/);
		});
	});
});
