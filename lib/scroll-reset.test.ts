import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
	SCROLL_TOP_TOLERANCE,
	createScrollResetTracker,
	scrollResetTarget,
	shouldResetScroll,
	trackRestingTop,
} from '@/lib/scroll-reset';

const read = (path: string) => {
	const p = resolve(__dirname, '..', path);
	return existsSync(p) ? readFileSync(p, 'utf8') : '';
};

/** Adjusted top inset under the Search tab's large title + search bar (any negative value works). */
const TOP = -148;

const fakeList = () => ({ scrollToOffset: vi.fn() });

describe('trackRestingTop', () => {
	it('keeps the lowest offset UIKit settles on before the first drag', () => {
		expect(trackRestingTop(null, -96, false)).toBe(-96);
		expect(trackRestingTop(-96, TOP, false)).toBe(TOP);
		expect(trackRestingTop(TOP, -96, false)).toBe(TOP);
	});

	it('freezes once the user drags (bounce overscroll is not the top)', () => {
		expect(trackRestingTop(TOP, -260, true)).toBe(TOP);
		expect(trackRestingTop(null, -260, true)).toBeNull();
	});
});

describe('scrollResetTarget', () => {
	it('scrolls to the negative inset top, not 0, when scrolled into results', () => {
		expect(scrollResetTarget(1200, TOP)).toBe(TOP);
	});

	it('falls back to 0 when no inset was observed', () => {
		expect(scrollResetTarget(1200, null)).toBe(0);
	});

	it('stays put when already at the top (no jump)', () => {
		expect(scrollResetTarget(TOP, TOP)).toBeNull();
		expect(scrollResetTarget(TOP + SCROLL_TOP_TOLERANCE, TOP)).toBeNull();
		expect(scrollResetTarget(TOP - 40, TOP)).toBeNull();
	});

	it('stays put when the list never scrolled', () => {
		expect(scrollResetTarget(null, null)).toBeNull();
	});
});

describe('shouldResetScroll', () => {
	it('resets only on a changed key', () => {
		expect(shouldResetScroll('hoth', 'hoth')).toBe(false);
		expect(shouldResetScroll('hoth', 'hothx')).toBe(true);
		expect(shouldResetScroll('hoth', '')).toBe(true);
	});
});

describe('createScrollResetTracker', () => {
	it('scrolled results → no-match query: scrolls back to the adjusted top', () => {
		const t = createScrollResetTracker();
		const list = fakeList();
		t.onScroll(TOP); // UIKit places the list at rest under the header
		t.onScrollBeginDrag();
		t.onScroll(900);
		t.onScroll(1400);
		expect(t.reset(list)).toBe(true);
		expect(list.scrollToOffset).toHaveBeenCalledTimes(1);
		expect(list.scrollToOffset).toHaveBeenCalledWith({ offset: TOP, animated: false });
	});

	it('a drag that overscrolls past the top does not move the remembered top', () => {
		const t = createScrollResetTracker();
		const list = fakeList();
		t.onScroll(TOP);
		t.onScrollBeginDrag();
		t.onScroll(TOP - 80);
		t.onScroll(600);
		t.reset(list);
		expect(list.scrollToOffset).toHaveBeenCalledWith({ offset: TOP, animated: false });
	});

	it('does not scroll when the query changes while already at the top', () => {
		const t = createScrollResetTracker();
		const list = fakeList();
		t.onScroll(TOP);
		expect(t.reset(list)).toBe(false);
		expect(list.scrollToOffset).not.toHaveBeenCalled();
	});

	it('a second change right after a reset does not scroll again', () => {
		const t = createScrollResetTracker();
		const list = fakeList();
		t.onScroll(TOP);
		t.onScrollBeginDrag();
		t.onScroll(700);
		t.reset(list);
		t.reset(list);
		expect(list.scrollToOffset).toHaveBeenCalledTimes(1);
	});

	it('tolerates a missing list ref', () => {
		const t = createScrollResetTracker();
		t.onScroll(500);
		expect(t.reset(null)).toBe(false);
	});
});

describe('Search screen wiring', () => {
	const screen = read('app/(tabs)/search/index.tsx');
	const hook = read('hooks/useScrollResetOnChange.ts');

	it('resets the results list on every trimmed-query change, via the list ref', () => {
		expect(screen).toMatch(/useRef<\s*FlashListRef<\s*Book\s*>\s*>\(\s*null\s*\)/);
		expect(screen).toMatch(/useScrollResetOnChange\(\s*listRef,\s*trimmed\s*\)/);
		expect(screen).toMatch(/<FlashList\s+ref=\{listRef\}/);
	});

	it('spreads the scroll handlers onto the list and stops MVCP anchoring old results', () => {
		expect(screen).toMatch(/\{\.\.\.scrollReset\}/);
		expect(screen).toMatch(/maintainVisibleContentPosition=\{MVCP_DISABLED\}/);
		expect(screen).toMatch(/MVCP_DISABLED\s*=\s*\{\s*disabled:\s*true\s*\}/);
	});

	it('the hook feeds scroll events to the tracker and allows the negative-offset scroll', () => {
		expect(hook).toMatch(/tracker\.onScroll\(\s*e\.nativeEvent\.contentOffset\.y\s*\)/);
		expect(hook).toMatch(/tracker\.onScrollBeginDrag\(\s*\)/);
		expect(hook).toMatch(/tracker\.reset\(\s*listRef\.current\s*\)/);
		expect(hook).toMatch(/scrollToOverflowEnabled:\s*true/);
		expect(hook).toMatch(/\[\s*resetKey,\s*listRef,\s*tracker\s*\]/);
	});
});
