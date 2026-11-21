import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { groupCenterX, railTranslateX } from '@/lib/timeline';
import * as railA11y from '@/lib/timeline-rail-a11y';

// Widest-screen-ish phone width and the pill slot half-width the rail passes in.
const W = 402;
const HALF = 90;
// Distinct timeline_order groups in the current catalog.
const COUNT = 69;

const pillOnScreen = (pillX: number, shownIndex: number, width: number, halfWidth: number) => {
	const fn = (railA11y as Record<string, unknown>).pillOnScreen;
	if (typeof fn !== 'function') throw new Error('pillOnScreen is not exported');
	return fn(pillX, shownIndex, width, halfWidth) as boolean;
};

/** Row-local pill x that lands the pill's center at screen-x `screenX` when `shown` is active. */
const pillXAt = (screenX: number, shown: number) => screenX - railTranslateX(W, shown);

describe('pillOnScreen', () => {
	it('keeps the pill on the centred group focusable', () => {
		expect(pillOnScreen(groupCenterX(10), 10, W, HALF)).toBe(true);
	});

	it('keeps a pill whose slot just overlaps the right edge', () => {
		expect(pillOnScreen(pillXAt(W + HALF - 0.5, 10), 10, W, HALF)).toBe(true);
	});

	it('hides a pill whose slot is just past the right edge', () => {
		expect(pillOnScreen(pillXAt(W + HALF, 10), 10, W, HALF)).toBe(false);
	});

	it('keeps a pill whose slot just overlaps the left edge', () => {
		expect(pillOnScreen(pillXAt(-HALF + 0.5, 10), 10, W, HALF)).toBe(true);
	});

	it('hides a pill whose slot is just past the left edge', () => {
		expect(pillOnScreen(pillXAt(-HALF, 10), 10, W, HALF)).toBe(false);
	});

	it('on the first group, keeps its own pill and hides a far-right one', () => {
		expect(pillOnScreen(groupCenterX(0), 0, W, HALF)).toBe(true);
		expect(pillOnScreen(groupCenterX(30), 0, W, HALF)).toBe(false);
	});

	it('on the last group, keeps its own pill and hides the first group pill', () => {
		expect(pillOnScreen(groupCenterX(COUNT - 1), COUNT - 1, W, HALF)).toBe(true);
		expect(pillOnScreen(groupCenterX(0), COUNT - 1, W, HALF)).toBe(false);
	});

	it('changes as the shown date steps toward an off-screen pill', () => {
		const x = groupCenterX(20);
		expect(pillOnScreen(x, 5, W, HALF)).toBe(false);
		expect(pillOnScreen(x, 15, W, HALF)).toBe(true);
	});
});

// Vitest is node-only (no render tests), so the wiring is asserted in source. A missing file
// reads as empty so a regression fails on assertions, not ENOENT.
const railPath = resolve(__dirname, '..', 'components/timeline-rail.tsx');
const railSource = existsSync(railPath) ? readFileSync(railPath, 'utf8') : '';

describe('marker pill a11y wiring', () => {
	it('MarkerPill hides itself from screen readers when off screen', () => {
		const body = railSource.match(/function MarkerPill\([\s\S]*?\n\}\n/)?.[0] ?? '';
		expect(body).not.toBe('');
		expect(body).toMatch(/accessibilityElementsHidden=\{\s*!onScreen\s*\}/);
		expect(body).toMatch(
			/importantForAccessibility=\{\s*onScreen\s*\?\s*'auto'\s*:\s*'no-hide-descendants'\s*\}/,
		);
	});

	it('every MarkerPill gets onScreen from pillOnScreen keyed to shownIndex', () => {
		const usages = railSource.split('<MarkerPill').slice(1);
		// The collapsed pills and the expanded set.
		expect(usages.length).toBe(2);
		for (const usage of usages) {
			const props = usage.slice(0, usage.indexOf('/>'));
			expect(props).toMatch(
				/onScreen=\{\s*pillOnScreen\(\s*[\w.]+,\s*shownIndex,\s*width,\s*PILL_SLOT_W\s*\/\s*2\s*\)\s*\}/,
			);
		}
	});
});
