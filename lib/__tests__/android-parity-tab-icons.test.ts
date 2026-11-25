import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #417: Android's Material 3 tab bar hides labels on unselected items once there are more than
// three tabs, and the tab icons were SF Symbols only (iOS). On the emulator only the selected
// tab's label showed; the other three tabs were blank. Each trigger now also takes an `md`
// Material Symbol, which expo-router uses on Android only (`sf` still wins on iOS).
const ROOT = resolve(__dirname, '..', '..');
const LAYOUT = readFileSync(resolve(ROOT, 'app/(tabs)/_layout.tsx'), 'utf8');
const SHIPPED = new Set(
	Object.keys(
		JSON.parse(
			readFileSync(resolve(ROOT, 'node_modules/expo-symbols/build/android/symbols.json'), 'utf8'),
		),
	),
);

const icons = [...LAYOUT.matchAll(/<NativeTabs\.Trigger\.Icon\b([\s\S]*?)\/>/g)].map((m) => m[1]);

/** Every quoted name in the `md=` prop (string or `{ default, selected }`). */
function mdNames(props: string): string[] {
	const md = props.match(/\bmd=(\{\s*\{[\s\S]*?\}\s*\}|"[^"]*")/)?.[1];
	if (!md) return [];
	return [...md.matchAll(/['"]([a-z0-9_]+)['"]/g)].map((m) => m[1]);
}

describe('Android tab icons (#417)', () => {
	it('has an icon for each of the four tabs', () => {
		expect(icons).toHaveLength(4);
	});

	it.each([0, 1, 2, 3])('tab %i keeps its SF Symbol and adds a Material Symbol', (i) => {
		const props = icons[i] ?? '';
		expect(props).toMatch(/\bsf=/);
		const names = mdNames(props);
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) expect(SHIPPED.has(name)).toBe(true);
	});
});
