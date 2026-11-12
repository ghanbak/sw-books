import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// #294: progressive blur under the scan tray's scrim. Pure tokens/helpers, a first-render
// check of the Reduce Transparency hook (React mocked to one pass, effects never run), and
// source-level wiring checks (no RN renderer in node-env vitest).
vi.mock('react', () => ({
	useState: <T>(init: T | (() => T)) => [
		typeof init === 'function' ? (init as () => T)() : init,
		() => {},
	],
	useEffect: () => {},
}));
vi.mock('react-native', () => ({
	AccessibilityInfo: {
		isReduceTransparencyEnabled: () => new Promise<boolean>(() => {}),
		isReduceMotionEnabled: () => new Promise<boolean>(() => {}),
		addEventListener: () => ({ remove: () => {} }),
	},
}));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));

import { tokens } from '@/constants/tokens';
import { useReduceTransparency } from '@/hooks/useAccessibility';
import { TRAY_RAMP_LOCATIONS, TRAY_SPACING, trayHeight, trayUsesBlur } from '@/lib/scan-tray';

const source = readFileSync(resolve(__dirname, 'scan-tray.tsx'), 'utf8');
const hookSource = readFileSync(resolve(__dirname, '../hooks/useAccessibility.ts'), 'utf8');

const alpha = (rgba: string) => Number(rgba.match(/,\s*([\d.]+)\)$/)?.[1]);

describe('blur tokens', () => {
	it('sets a moderate dark-material blur', () => {
		expect(tokens.scanTray.blurIntensity).toBeGreaterThanOrEqual(1);
		expect(tokens.scanTray.blurIntensity).toBeLessThanOrEqual(100);
		expect(tokens.scanTray.blurTint).toBe('systemUltraThinMaterialDark');
	});

	it('ramps the mask from clear to opaque, monotonically', () => {
		const stops = [
			tokens.scanTray.blurMaskClear,
			tokens.scanTray.blurMaskLow,
			tokens.scanTray.blurMaskMid,
			tokens.scanTray.blurMaskFull,
		].map(alpha);
		expect(stops[0]).toBe(0);
		expect(stops[3]).toBe(1);
		for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThan(stops[i - 1]);
	});
});

describe('blur geometry', () => {
	it('is clear at the tray top, 8pt above the covers', () => {
		expect(TRAY_RAMP_LOCATIONS[0]).toBe(0);
		expect(alpha(tokens.scanTray.blurMaskClear)).toBe(0);
		expect(TRAY_SPACING.top).toBe(8);
		expect(trayHeight(132) - 132 - TRAY_SPACING.bottom).toBe(8);
	});

	it('reaches full strength at the tray bottom and holds to the screen bottom', () => {
		expect(TRAY_RAMP_LOCATIONS[TRAY_RAMP_LOCATIONS.length - 1]).toBe(1);
		expect(source).toMatch(/blurMaskTail:\s*\{[^}]*flex:\s*1[^}]*tokens\.scanTray\.blurMaskFull/);
		expect(source).toMatch(/bottom:\s*-windowHeight/);
	});
});

describe('Reduce Transparency gate', () => {
	it('drops the blur when Reduce Transparency is on', () => {
		expect(trayUsesBlur(true)).toBe(false);
		expect(trayUsesBlur(false)).toBe(true);
	});

	it('starts opaque before the setting resolves', () => {
		expect(useReduceTransparency()).toBe(true);
	});

	it('reads and listens to the iOS setting', () => {
		expect(hookSource).toMatch(/AccessibilityInfo\.isReduceTransparencyEnabled\(\)/);
		expect(hookSource).toMatch(/addEventListener\(\s*'reduceTransparencyChanged'/);
	});
});

describe('scan tray blur wiring', () => {
	it('imports BlurView and MaskedView', () => {
		expect(source).toMatch(/import \{ BlurView \} from 'expo-blur'/);
		expect(source).toMatch(/import MaskedView from '@react-native-masked-view\/masked-view'/);
	});

	it('gates the blur on Reduce Transparency', () => {
		expect(source).toMatch(/trayUsesBlur\(\s*useReduceTransparency\(\)\s*\)/);
		expect(source).toMatch(/\{showBlur \? \(\s*<MaskedView/);
	});

	it('masks a tokenized BlurView with the tokenized ramp', () => {
		expect(source).toMatch(/maskElement=\{/);
		for (const stop of ['blurMaskClear', 'blurMaskLow', 'blurMaskMid', 'blurMaskFull']) {
			expect(source).toContain(`tokens.scanTray.${stop}`);
		}
		expect(source).toMatch(/<BlurView\s+intensity=\{tokens\.scanTray\.blurIntensity\}/);
		expect(source).toMatch(/tint=\{tokens\.scanTray\.blurTint\}/);
	});

	it('keeps the scrim on top of the blur, always rendered', () => {
		const blurAt = source.indexOf('<MaskedView');
		const scrimAt = source.indexOf('tokens.scanTray.scrimClear');
		expect(blurAt).toBeGreaterThan(-1);
		expect(scrimAt).toBeGreaterThan(blurAt);
		expect(source).toMatch(/\) : null\}\s*<LinearGradient/);
	});

	it('shares the ramp between scrim and mask', () => {
		expect(source.match(/locations=\{TRAY_RAMP_LOCATIONS\}/g)).toHaveLength(2);
	});
});
