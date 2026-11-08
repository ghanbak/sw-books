import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	RAIL_PITCH,
	clampIndex,
	indexAtScreenX,
	railPagerSync,
	railTranslateX,
} from '@/lib/timeline';

const W = 402;
const COUNT = 40;

// Vitest is node-only (no render tests), so the rail's paging effect is modelled through the
// pure `railPagerSync` it calls, and the wiring is asserted in source.
const railSource = readFileSync(resolve(__dirname, '..', 'components/timeline-rail.tsx'), 'utf8');

describe('railPagerSync', () => {
	it('re-centers a tapped far notch once the pager reports it', () => {
		// Rail centered on group 2; tap the notch for group 9 (well right of center).
		let translateX = railTranslateX(W, 2);
		const tapX = translateX + 9 * RAIL_PITCH + RAIL_PITCH / 2;
		const tapped = clampIndex(Math.round(indexAtScreenX(tapX, translateX)), COUNT);
		expect(tapped).toBe(9);

		// The tap only drives the pager (pendingIndex = tapped); translateX is untouched.
		let pending: number | null = tapped;
		for (const reported of [2, tapped]) {
			const sync = railPagerSync(pending, reported, W);
			pending = sync.pendingIndex;
			if (sync.translateX !== null) translateX = sync.translateX;
		}

		expect(pending).toBeNull();
		expect(translateX).toBe(railTranslateX(W, tapped));
	});

	it('holds the rail while the pager reports a stale page', () => {
		expect(railPagerSync(9, 4, W)).toEqual({ pendingIndex: 9, translateX: null });
	});

	it('follows the pager when nothing is pending', () => {
		expect(railPagerSync(null, 5, W)).toEqual({
			pendingIndex: null,
			translateX: railTranslateX(W, 5),
		});
	});

	it('is what the rail paging effect calls', () => {
		expect(railSource).toContain('railPagerSync(pendingIndex.current, activeIndex, width)');
	});
});

describe('rail date label a11y', () => {
	it('hides the visible date label (the rail already announces it as its value)', () => {
		const match = railSource.match(/<Text\b([^>]*)>\s*\{active\.label\}/);
		expect(match).not.toBeNull();
		const props = match?.[1] ?? '';
		expect(props).toContain('accessibilityElementsHidden');
		expect(props).toContain('importantForAccessibility="no-hide-descendants"');
	});
});
