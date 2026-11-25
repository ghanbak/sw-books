import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #417: the react-native-screens patch adds `largeTitleInline` to the header-config codegen spec
// (for the iOS inline large title). Android codegen then generates an abstract
// `setLargeTitleInline` on the view-manager interface, so the patch must also implement it in
// Kotlin, or `:react-native-screens:compileDebugKotlin` fails and no Android build is possible.
const ROOT = resolve(__dirname, '..', '..');
const PATCH = readFileSync(resolve(ROOT, 'patches/react-native-screens+4.26.2.patch'), 'utf8');

/** Lines the patch adds to one file (the `+` lines of its diff section). */
function addedLines(file: string): string {
	const sections = PATCH.split(/^diff --git /m);
	const section = sections.find((s) =>
		s.startsWith(`a/node_modules/react-native-screens/${file} `),
	);
	if (!section) return '';
	return section
		.split('\n')
		.filter((line) => line.startsWith('+') && !line.startsWith('+++'))
		.map((line) => line.slice(1))
		.join('\n');
}

const SPEC = 'src/fabric/ScreenStackHeaderConfigNativeComponent.ts';
const MANAGER =
	'android/src/main/java/com/swmansion/rnscreens/ScreenStackHeaderConfigViewManager.kt';

describe('react-native-screens patch builds on Android (#417)', () => {
	it('adds largeTitleInline to the codegen spec (iOS inline large title)', () => {
		expect(addedLines(SPEC)).toMatch(/largeTitleInline\?:\s*boolean/);
	});

	it('implements the generated setLargeTitleInline on the Android view manager', () => {
		expect(addedLines(MANAGER)).toMatch(
			/override\s+fun\s+setLargeTitleInline\(\s*view:\s*ScreenStackHeaderConfig\?,\s*value:\s*Boolean,?\s*\)\s*=\s*Unit/,
		);
	});
});

// #417: react-native-webgpu's Android C++ calls AHardwareBuffer_* (API 26+). React Native's
// default minSdk is 24, so `:react-native-webgpu:buildCMakeDebug` fails unless the app raises it.
describe('Android minSdk covers react-native-webgpu (#417)', () => {
	const app = JSON.parse(readFileSync(resolve(ROOT, 'app.json'), 'utf8')).expo;
	const plugin = (name: string) =>
		app.plugins.find((p: unknown) => p === name || (Array.isArray(p) && p[0] === name));

	it('links react-native-webgpu', () => {
		expect(plugin('react-native-webgpu')).toBeDefined();
	});

	it('sets android.minSdkVersion to at least 26 through expo-build-properties', () => {
		const entry = plugin('expo-build-properties');
		expect(Array.isArray(entry)).toBe(true);
		expect(entry[1]?.android?.minSdkVersion).toBeGreaterThanOrEqual(26);
	});

	it('leaves the iOS deployment target as it was', () => {
		expect(plugin('expo-build-properties')[1].ios).toEqual({ deploymentTarget: '16.4' });
	});
});
