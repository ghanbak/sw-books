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
});
