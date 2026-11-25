import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { useMaterialSymbolSource } from '@/hooks/useMaterialSymbolSource';

// #428: @expo/ui's universal Icon returns null on Android for a bare SF Symbol string, so
// Profile's row icons were invisible there. They now go through SFIcon: the SF name as-is on iOS,
// its Material Symbol (rendered by useMaterialSymbolSource) on Android.
const ROOT = resolve(__dirname, '..', '..');

function read(rel: string) {
	const path = resolve(ROOT, rel);
	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const PROFILE = read('app/profile.tsx');
const ICON = read('components/sf-icon.tsx');
const ICON_ANDROID = read('components/sf-icon.android.tsx');
const SHIPPED = Object.keys(
	JSON.parse(read('node_modules/expo-symbols/build/android/symbols.json') || '{}'),
);

describe('Profile row icons on Android (#428)', () => {
	it('Profile imports SFIcon', () => {
		expect(PROFILE).toMatch(/import\s*\{\s*SFIcon\s*\}\s*from\s*'@\/components\/sf-icon'/);
	});

	it.each([
		['arrow.up.right', 'open_in_new'],
		['rectangle.portrait.and.arrow.right', 'logout'],
		['trash', 'delete'],
	])('%s maps to the Material Symbol %s', (sf, material) => {
		const escaped = sf.replace(/\./g, '\\.');
		expect(PROFILE).toMatch(
			new RegExp(`<SFIcon\\s+name="${escaped}"\\s+android="${material}"\\s+color=\\{`),
		);
		expect(SHIPPED).toContain(material);
	});

	it('no raw @expo/ui Icon is left in Profile (Android renders null for SF names)', () => {
		expect(PROFILE).not.toBe('');
		expect(PROFILE).not.toMatch(/<Icon\b/);
	});

	it('Android renders the mapped Material Symbol source, tinted with the row colour', () => {
		// #435: the bitmap is seeded opaque; the row colour reaches the user as the Icon tint.
		expect(ICON_ANDROID).toMatch(/useMaterialSymbolSource\(\s*android,\s*24,\s*OPAQUE_SEED\s*\)/);
		expect(ICON_ANDROID).toMatch(
			/<Icon\s+name=\{\s*source\s*\}\s+size=\{\s*24\s*\}\s+color=\{\s*color\s*\}/,
		);
	});

	it('iOS keeps the SF name and never renders a Material bitmap', () => {
		expect(ICON).toMatch(/<Icon\s+name=\{\s*name\s*\}\s+color=\{\s*color\s*\}\s*\/>/);
		expect(ICON).not.toMatch(/useMaterialSymbolSource/);
	});
});

describe('useMaterialSymbolSource color (#428)', () => {
	it('accepts any colour string, not just the default token literal', () => {
		// Type-level: tsc (npm run typecheck) fails if `color` narrows back to a literal.
		expectTypeOf<Parameters<typeof useMaterialSymbolSource>[2]>().toEqualTypeOf<
			string | undefined
		>();
	});
});
