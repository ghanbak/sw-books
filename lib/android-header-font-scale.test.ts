import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ANDROID_HEADER_TITLE_SIZE_SP, headerTitleStyle } from '@/lib/header-title-style';

// react-native-screens applies `fontSize` with TextView.setTextSize(float), which is in sp, so the
// toolbar multiplies by the system font scale itself. Without it the AppCompat default (20dp) stays fixed.
const spToPx = (sp: number, fontScale: number, density = 1) => sp * fontScale * density;

describe('headerTitleStyle', () => {
	it('gives Android an explicit sp size equal to the AppCompat toolbar default', () => {
		const style = headerTitleStyle('Aurebesh', 'android');
		expect(style).toEqual({ fontFamily: 'Aurebesh', fontSize: 20 });
		expect(ANDROID_HEADER_TITLE_SIZE_SP).toBe(20);
	});

	it('renders 20 at 100% and 40 at 200% once the toolbar applies the font scale', () => {
		const { fontSize } = headerTitleStyle(undefined, 'android');
		expect(fontSize).toBeDefined();
		expect(spToPx(fontSize ?? 0, 1)).toBe(20);
		expect(spToPx(fontSize ?? 0, 2)).toBe(40);
	});

	it('does not pre-scale the size, which would scale it twice', () => {
		expect(headerTitleStyle(undefined, 'android').fontSize).toBe(ANDROID_HEADER_TITLE_SIZE_SP);
	});

	it('leaves iOS with fontFamily only so UIKit keeps its Dynamic Type sizing', () => {
		const style = headerTitleStyle('Aurebesh', 'ios');
		expect(style).toEqual({ fontFamily: 'Aurebesh' });
		expect('fontSize' in style).toBe(false);
	});
});

const LAYOUTS = [
	'app/_layout.tsx',
	'app/(tabs)/archives/_layout.tsx',
	'app/(tabs)/library/_layout.tsx',
	'app/(tabs)/search/_layout.tsx',
	'app/(tabs)/timeline/_layout.tsx',
];

describe('header title wiring', () => {
	it.each(LAYOUTS)('%s sets headerTitleStyle through the helper with Platform.OS', (path) => {
		const src = readFileSync(resolve(__dirname, '..', path), 'utf8');
		expect(src).toMatch(
			/headerTitleStyle:\s*headerTitleStyle\(\s*fontFamily\s*,\s*Platform\.OS\s*,?\s*\)/,
		);
		expect(src).not.toMatch(/headerTitleStyle:\s*\{\s*fontFamily\s*\}/);
	});
});
