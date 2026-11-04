import { describe, expect, it } from 'vitest';

import {
	MAX_ROTATION_Y,
	RIG_HEIGHT,
	cardRect,
	cardTransform,
	fitCardWidth,
	pageAt,
	windowIndices,
	worldPerPoint,
} from './pager';

describe('cardTransform', () => {
	it('centres the active card with no turn and full opacity', () => {
		expect(cardTransform(2, 800, 400)).toEqual({
			offset: 0,
			rotationY: -0,
			opacity: 1,
			visible: true,
		});
	});

	it('offsets neighbours by a page and turns them away from centre', () => {
		const next = cardTransform(3, 800, 400);
		expect(next.offset).toBe(400);
		expect(next.rotationY).toBeCloseTo(-MAX_ROTATION_Y);
		expect(next.opacity).toBeCloseTo(0.5);
		expect(next.visible).toBe(true);
		expect(cardTransform(1, 800, 400).rotationY).toBeCloseTo(MAX_ROTATION_Y);
	});

	it('hides cards more than 1.5 pages away and clamps the turn', () => {
		const far = cardTransform(5, 800, 400);
		expect(far.visible).toBe(false);
		expect(far.rotationY).toBeCloseTo(-MAX_ROTATION_Y);
	});

	it('handles overscroll past the first page', () => {
		const first = cardTransform(0, -60, 400);
		expect(first.offset).toBe(60);
		expect(first.visible).toBe(true);
	});

	it('never produces NaN with a zero page width', () => {
		const t = cardTransform(1, 100, 0);
		expect(Number.isNaN(t.offset)).toBe(false);
		expect(t.visible).toBe(false);
		expect(cardTransform(0, 100, 0).visible).toBe(true);
	});
});

describe('pageAt', () => {
	it('rounds to the nearest page and clamps to the list', () => {
		expect(pageAt(590, 400, 10)).toBe(1);
		expect(pageAt(610, 400, 10)).toBe(2);
		expect(pageAt(-200, 400, 10)).toBe(0);
		expect(pageAt(99_999, 400, 10)).toBe(9);
	});

	it('is 0 for an empty list or zero width', () => {
		expect(pageAt(500, 400, 0)).toBe(0);
		expect(pageAt(500, 0, 10)).toBe(0);
	});
});

describe('windowIndices', () => {
	it('returns active ± radius', () => {
		expect(windowIndices(5, 10)).toEqual([4, 5, 6]);
	});

	it('clamps at both ends', () => {
		expect(windowIndices(0, 10)).toEqual([0, 1]);
		expect(windowIndices(9, 10)).toEqual([8, 9]);
		expect(windowIndices(0, 1)).toEqual([0]);
	});

	it('is empty for an empty list', () => {
		expect(windowIndices(0, 0)).toEqual([]);
	});
});

describe('cardRect', () => {
	it('centres the card in the cell', () => {
		expect(cardRect(400, 600, 200, 300)).toEqual({ x: 100, y: 150, width: 200, height: 300 });
	});

	it('applies the lift upwards', () => {
		expect(cardRect(400, 600, 200, 300, 40).y).toBe(110);
	});
});

describe('worldPerPoint / fitCardWidth', () => {
	it('maps the visible world height onto the view height', () => {
		const visible = 2 * 5 * Math.tan((15 * Math.PI) / 180);
		expect(worldPerPoint(500)).toBeCloseTo(visible / 500);
		expect(worldPerPoint(0)).toBe(0);
	});

	it('fits the rig to the view, capped', () => {
		expect(fitCardWidth(430, 220)).toBe(Math.round(430 / RIG_HEIGHT));
		expect(fitCardWidth(2000, 220)).toBe(220);
		expect(fitCardWidth(0, 220)).toBe(0);
	});
});
