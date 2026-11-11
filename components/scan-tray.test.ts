import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	TRAY_COVER_MAX_WIDTH,
	TRAY_COVER_OPACITY,
	TRAY_DROP,
	TRAY_SPACING,
	trayCoverSize,
	trayHeight,
	trayMotion,
	traySkipsEntering,
} from '@/lib/scan-tray';

// #75: Scanner V2 tray. Pure helpers plus source-level wiring checks (no RN renderer here).
const source = readFileSync(resolve(__dirname, 'scan-tray.tsx'), 'utf8');

describe('trayCoverSize', () => {
	it('keeps the Archives-row cover at 88×132', () => {
		expect(trayCoverSize(88)).toEqual({ width: 88, height: 132 });
	});

	it('caps the width at 200pt and stays 2:3', () => {
		expect(trayCoverSize(320)).toEqual({ width: TRAY_COVER_MAX_WIDTH, height: 300 });
		expect(TRAY_COVER_MAX_WIDTH).toBe(200);
	});

	it('never goes negative', () => {
		expect(trayCoverSize(-4)).toEqual({ width: 0, height: 0 });
	});
});

describe('tray geometry', () => {
	it('puts the scrim edge 8pt above the covers', () => {
		expect(TRAY_SPACING.top).toBe(8);
		expect(trayHeight(132)).toBe(8 + 132 + TRAY_SPACING.bottom);
	});

	it('keeps spacing on the 8pt grid', () => {
		for (const v of Object.values(TRAY_SPACING)) expect(v % 8).toBe(0);
	});

	it('makes covers slightly transparent', () => {
		expect(TRAY_COVER_OPACITY).toBeGreaterThan(0.75);
		expect(TRAY_COVER_OPACITY).toBeLessThan(1);
	});

	it('drops in from size 0', () => {
		expect(TRAY_DROP.fromScale).toBe(0);
		expect(TRAY_DROP.fromTranslateY).toBeLessThan(0);
	});
});

describe('trayMotion', () => {
	it('animates the drop, shift and scroll by default', () => {
		expect(trayMotion(false)).toEqual({
			animateEnter: true,
			animateShift: true,
			animateScroll: true,
		});
	});

	it('skips all motion under Reduce Motion (books appear in place)', () => {
		expect(trayMotion(true)).toEqual({
			animateEnter: false,
			animateShift: false,
			animateScroll: false,
		});
	});
});

describe('traySkipsEntering', () => {
	it('plays the drop for the first book when the tray mounted empty', () => {
		expect(traySkipsEntering(0, false)).toBe(false);
	});

	it('plays the drop again after the tray was emptied', () => {
		expect(traySkipsEntering(3, true)).toBe(false);
	});

	it('skips only books already present at mount', () => {
		expect(traySkipsEntering(3, false)).toBe(true);
	});
});

describe('scan-tray wiring', () => {
	it('exports ScanTray({ books }) per the #74 contract', () => {
		expect(source).toMatch(
			/export function ScanTray\(\{\s*books\s*\}:\s*\{\s*books:\s*Book\[\]\s*\}\)/,
		);
	});

	it('feeds the reduce-motion hook into trayMotion', () => {
		expect(source).toMatch(/const reduceMotion = useReduceMotion\(\)/);
		expect(source).toMatch(/trayMotion\(\s*reduceMotion\s*\)/);
	});

	it('gates the enter, shift and scroll on the motion flags', () => {
		expect(source).toMatch(
			/entering=\{\s*motion\.animateEnter\s*\?\s*trayDropIn\s*:\s*undefined\s*\}/,
		);
		expect(source).toMatch(
			/layout=\{\s*motion\.animateShift\s*\?\s*trayShift\s*:\s*undefined\s*\}/,
		);
		expect(source).toMatch(/animated:\s*motion\.animateScroll/);
	});

	it('reuses the Archives-row HoloCover at the shared row width', () => {
		expect(source).toMatch(/<HoloCover\b/);
		expect(source).toMatch(/trayCoverSize\(\s*BOOK_CARD_COVER\.width\s*\)/);
	});

	it('renders newest first, left to right (no reversal)', () => {
		expect(source).toMatch(/books\.map\(/);
		expect(source).not.toMatch(/\.reverse\(|inverted/);
	});

	it('applies cover opacity and the tokenized scrim', () => {
		expect(source).toMatch(/opacity:\s*TRAY_COVER_OPACITY/);
		for (const stop of ['scrimClear', 'scrimLow', 'scrimMid', 'scrimFull']) {
			expect(source).toContain(`tokens.scanTray.${stop}`);
		}
	});

	it('uses tokens only (no color literals)', () => {
		expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
	});

	it('labels each cover for screen readers', () => {
		expect(source).toMatch(/accessibilityLabel=\{\s*bookRowLabel\(\s*book\s*\)\s*\}/);
	});

	it('lets the first book of a session drop in (no unconditional skipEntering)', () => {
		expect(source).not.toMatch(/<LayoutAnimationConfig\s+skipEntering\s*>/);
		expect(source).toMatch(/skipEntering=\{\s*skipEntering\s*\}/);
		expect(source).toMatch(
			/traySkipsEntering\(\s*booksAtMount\s*,\s*emptiedSinceMount\.current\s*\)/,
		);
		expect(source).toMatch(/useRef\(\s*books\.length\s*\)/);
	});

	it('keeps the drop headroom inside the scroll bounds', () => {
		expect(source).toMatch(/marginTop:\s*-TRAY_DROP_HEADROOM/);
		expect(source).toMatch(/paddingTop:\s*TRAY_DROP_HEADROOM\s*\+\s*TRAY_SPACING\.top/);
	});

	it('never builds a transform from a string', () => {
		expect(source).not.toMatch(/`[^`]*\$\{\s*with(Timing|Spring)/);
	});
});
