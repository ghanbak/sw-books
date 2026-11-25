import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #414: Profile imported DisclosureGroup / ProgressView / `disabled` from @expo/ui/swift-ui, whose
// native views only exist on iOS. Android now resolves a Compose shim with the same names.
const ROOT = resolve(__dirname, '..', '..');
const PROFILE = 'app/profile.tsx';
const SHIM = 'components/profile-disclosure.tsx';
const ANDROID = 'components/profile-disclosure.android.tsx';

function read(rel: string) {
	const path = resolve(ROOT, rel);
	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const SWIFT_UI = /from\s*'@expo\/ui\/swift-ui(\/[^']*)?'/;

describe('Profile platform split (#414)', () => {
	it('app/profile.tsx imports no @expo/ui/swift-ui module directly', () => {
		const source = read(PROFILE);
		expect(source).not.toBe('');
		expect(source).not.toMatch(SWIFT_UI);
	});

	it('app/profile.tsx takes DisclosureGroup, ProgressView and disabled from the shim', () => {
		const source = read(PROFILE);
		const named = source.match(
			/import\s*\{([^}]*)\}\s*from\s*'@\/components\/profile-disclosure'/,
		)?.[1];
		expect(named).toBeDefined();
		for (const name of ['DisclosureGroup', 'ProgressView', 'disabled']) {
			expect(named).toMatch(new RegExp(`\\b${name}\\b`));
		}
	});

	it('iOS keeps the SwiftUI views it used before', () => {
		const source = read(SHIM);
		expect(source).toMatch(
			/export\s*\{\s*DisclosureGroup,\s*ProgressView\s*\}\s*from\s*'@expo\/ui\/swift-ui'/,
		);
		expect(source).toMatch(/export\s*\{\s*disabled\s*\}\s*from\s*'@expo\/ui\/swift-ui\/modifiers'/);
	});

	it('the Android shim never imports @expo/ui/swift-ui', () => {
		const source = read(ANDROID);
		expect(source).not.toBe('');
		expect(source).not.toMatch(SWIFT_UI);
		expect(source).toMatch(/from\s*'@expo\/ui\/jetpack-compose'/);
	});

	it.each(['DisclosureGroup', 'ProgressView', 'disabled'])(
		'the Android shim exports %s',
		(name) => {
			expect(read(ANDROID)).toMatch(new RegExp(`export\\s+function\\s+${name}\\b`));
		},
	);
});

describe('Android disclosure header state (#414)', () => {
	const source = read(ANDROID);

	it('the header row toggles the expanded state', () => {
		expect(source).toMatch(/onPress=\{\s*\(\)\s*=>\s*onIsExpandedChange\(\s*!isExpanded\s*\)\s*\}/);
	});

	it('TalkBack hears Expanded / Collapsed from the header', () => {
		expect(source).toMatch(
			/accessibilityLabel=\{\s*isExpanded\s*\?\s*'Expanded'\s*:\s*'Collapsed'\s*\}/,
		);
	});

	it('the body shows only while expanded', () => {
		expect(source).toMatch(/<AnimatedVisibility\s+visible=\{\s*isExpanded\s*\}/);
	});

	it('the chevron is a Material Symbol expo-symbols ships', () => {
		const symbol = source.match(/useMaterialSymbolSource\(\s*'([^']+)'/)?.[1];
		expect(symbol).toBeDefined();
		const shipped = Object.keys(
			JSON.parse(read('node_modules/expo-symbols/build/android/symbols.json') || '{}'),
		);
		expect(shipped).toContain(symbol);
	});
});
