import { describe, expect, it } from 'vitest';

import {
	FILTER_PILL_HEIGHT,
	FILTER_PILL_HIT_SLOP,
	MIN_TAP_TARGET,
	SHEET_ICON_BUTTON_HIT_SLOP,
	SHEET_ICON_BUTTON_SIZE,
	cappedVerticalHitSlop,
	slopBoundsStyle,
	slopFor,
	squareHitSlop,
	verticalHitSlop,
} from '@/lib/tap-target';

describe('tap targets', () => {
	it('grows a size to at least 44pt, never shrinks', () => {
		expect(slopFor(30)).toBe(7);
		expect(slopFor(31)).toBe(7); // rounds up: 31 + 14 >= 44
		expect(slopFor(36)).toBe(4);
		expect(slopFor(44)).toBe(0);
		expect(slopFor(60)).toBe(0);
	});

	it('filter pills reach 44pt vertically with no horizontal slop', () => {
		expect(
			FILTER_PILL_HEIGHT + FILTER_PILL_HIT_SLOP.top + FILTER_PILL_HIT_SLOP.bottom,
		).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
		expect(FILTER_PILL_HIT_SLOP).not.toHaveProperty('left');
		expect(FILTER_PILL_HIT_SLOP).not.toHaveProperty('right');
		expect(verticalHitSlop(30)).toEqual({ top: 7, bottom: 7 });
	});

	it('sheet icon buttons reach 44x44', () => {
		const s = SHEET_ICON_BUTTON_HIT_SLOP;
		expect(SHEET_ICON_BUTTON_SIZE + s.top + s.bottom).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
		expect(SHEET_ICON_BUTTON_SIZE + s.left + s.right).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
		expect(squareHitSlop(36)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
	});

	it('caps the top slop and gives the rest to the bottom (#357 card "See all")', () => {
		// 11/13 link text inside a card with 12pt padding and overflow: hidden.
		const s = cappedVerticalHitSlop(13, 12);
		expect(s).toEqual({ top: 12, bottom: 19 });
		expect(13 + s.top + s.bottom).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
		expect(cappedVerticalHitSlop(30, 12)).toEqual({ top: 7, bottom: 7 });
		expect(cappedVerticalHitSlop(13, 0)).toEqual({ top: 0, bottom: 31 });
		expect(cappedVerticalHitSlop(60, 12)).toEqual({ top: 0, bottom: 0 });
	});

	it('widens container bounds without net layout change', () => {
		const st = slopBoundsStyle({ top: 7, bottom: 7 });
		expect(st.paddingTop + st.marginTop).toBe(0);
		expect(st.paddingBottom + st.marginBottom).toBe(0);
		expect(st.paddingTop).toBe(7);
		expect(st.paddingLeft).toBe(0);
	});
});
