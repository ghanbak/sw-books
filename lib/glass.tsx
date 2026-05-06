import type { GlassViewProps } from 'expo-glass-effect';
import { Platform, type ViewProps } from 'react-native';

// Safe wrapper around expo-glass-effect.
//
// The package's isLiquidGlassAvailable() calls requireNativeModule('ExpoGlassEffect')
// on first invocation, which throws if the native module isn't linked into the
// running binary — e.g. running in Expo Go, or after `npm install` but before
// the next `npx expo run:ios`. Without this guard, the app red-screens on launch.
//
// On iOS 26+ with a properly rebuilt dev client: glass is on, forced to dark.
// Anywhere else (older iOS, Android, Expo Go, stale build): glass is silently off.

export let liquidGlassAvailable = false;
let RealGlassView: ((props: GlassViewProps) => React.ReactElement) | null = null;

if (Platform.OS === 'ios') {
	try {
		const mod = require('expo-glass-effect');
		liquidGlassAvailable = mod.isLiquidGlassAvailable();
		RealGlassView = mod.GlassView;
	} catch {
		// Native module not linked — leave defaults (off / null).
	}
}

// The app is dark-only (see CLAUDE.md design context). Force colorScheme="dark"
// so glass surfaces match our tokens regardless of the system appearance — without
// this, glass renders light when the device is in Light mode.
export function GlassView(props: ViewProps) {
	if (!RealGlassView) return null;
	return <RealGlassView colorScheme="dark" {...props} />;
}
