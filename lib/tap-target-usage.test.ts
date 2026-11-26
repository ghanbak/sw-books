import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MIN_TAP_TARGET, cappedVerticalHitSlop } from './tap-target';

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

	// #469: Timeline film/TV marker pills (18pt) in 22pt stacked rows, capped by their slot.
	describe('components/timeline-rail.tsx marker pills', () => {
		function railSource(): string {
			try {
				return source('components/timeline-rail.tsx');
			} catch {
				return '';
			}
		}

		function between(src: string, start: string, end: string): string {
			const a = src.indexOf(start);
			const b = a === -1 ? -1 : src.indexOf(end, a);
			return a === -1 || b === -1 ? '' : src.slice(a, b);
		}

		function constant(src: string, name: string): number {
			const m = src.match(new RegExp(`const ${name}\\s*=\\s*(\\d+);`));
			return m ? Number(m[1]) : Number.NaN;
		}

		const src = railSource();
		const markerPill = between(src, 'function MarkerPill(', 'const styles = StyleSheet.create(');
		const pillSlotHit = between(src, 'pillSlotHit: {', '},');
		const pillStyle = between(src, '\tpill: {', '},');

		it('finds MarkerPill and its styles', () => {
			expect(markerPill).not.toBe('');
			expect(pillSlotHit).not.toBe('');
			expect(pillStyle).not.toBe('');
		});

		it('keeps the visible row pitch and pill size (non-visual fix)', () => {
			expect(constant(src, 'PILL_ROW_H')).toBe(22);
			expect(constant(src, 'STEM_GAP')).toBe(4);
			expect(constant(src, 'PILL_H')).toBe(18);
			expect(pillStyle).toMatch(/height:\s*PILL_H\b/);
		});

		it('gives pressable pills >= 44pt of hit height, biased up, bottom inside the slot', () => {
			const rowH = constant(src, 'PILL_ROW_H');
			const pillH = constant(src, 'PILL_H');
			const inset = (rowH - pillH) / 2;
			// Mirrors the source: the helper's capped side flipped to face the row below.
			const capped = cappedVerticalHitSlop(pillH, inset);
			const top = capped.bottom;
			const bottom = capped.top;
			expect(pillH + top + bottom).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
			// Bottom slop ends at the slot edge: half the 4pt gap to the row below, and STEM_GAP
			// clear of the rail, so it never reaches the next row's pill or the notches.
			expect(bottom).toBeLessThanOrEqual(inset);
			expect(top).toBeGreaterThan(bottom);
			expect(src).toMatch(/cappedVerticalHitSlop\(\s*PILL_H,\s*PILL_INSET\s*\)/);
			expect(src).toMatch(/PILL_INSET\s*=\s*\(\s*PILL_ROW_H\s*-\s*PILL_H\s*\)\s*\/\s*2/);
			expect(src).toMatch(/top:\s*PILL_CAPPED_SLOP\.bottom,\s*bottom:\s*PILL_CAPPED_SLOP\.top/);
		});

		it('passes the slop to pressable pills only and grows their slot by the same slop', () => {
			// Non-pressable single pills (accessibilityRole 'text') keep their old hitSlop.
			expect(markerPill).toMatch(/hitSlop=\{\s*onPress\s*\?\s*PILL_HIT_SLOP\s*:\s*6\s*\}/);
			expect(markerPill).toMatch(/onPress\s*&&\s*styles\.pillSlotHit/);
			expect(pillSlotHit).toMatch(/\.\.\.slopBoundsStyle\(\s*PILL_VERTICAL_SLOP\s*\)/);
			// Net-zero layout: the slot's content box stays one 22pt row.
			expect(pillSlotHit).toMatch(
				/height:\s*PILL_ROW_H\s*\+\s*PILL_VERTICAL_SLOP\.top\s*\+\s*PILL_VERTICAL_SLOP\.bottom/,
			);
		});

		it('hit-tests higher rows first so a top slop never covers the pill stacked above', () => {
			expect(markerPill).toMatch(/zIndex:\s*row\b/);
		});
	});
});
