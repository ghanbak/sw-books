import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';

/**
 * Aurebesh font preference — a single persisted boolean that swaps the app's font.
 * Minimal by design (no provider/theme system): the toggle flips a global default on
 * `<Text>` and persists it.
 *
 * NOTE: the actual Aurebesh font binary isn't bundled yet. Add
 * `assets/fonts/Aurebesh.ttf`, register it via `useFonts` in app/_layout, then flip
 * AUREBESH_AVAILABLE to true and apply AUREBESH_FONT to the native header / tab-label /
 * search-bar styles for full coverage. Until then the toggle persists but text stays in
 * the system font (so we never set an unregistered fontFamily and spam warnings).
 */

const KEY = '@ossus/aurebesh';
export const AUREBESH_FONT = 'Aurebesh';
export const AUREBESH_AVAILABLE = false;

/** Set (or clear) the global default font for every JS `<Text>`. */
export function applyGlobalFont(on: boolean): void {
	const T = Text as unknown as { defaultProps?: { style?: unknown } };
	T.defaultProps = T.defaultProps ?? {};
	T.defaultProps.style = on && AUREBESH_AVAILABLE ? { fontFamily: AUREBESH_FONT } : undefined;
}

export async function loadAurebeshPref(): Promise<boolean> {
	try {
		return (await AsyncStorage.getItem(KEY)) === '1';
	} catch {
		return false;
	}
}

export async function setAurebeshPref(on: boolean): Promise<void> {
	applyGlobalFont(on);
	try {
		await AsyncStorage.setItem(KEY, on ? '1' : '0');
	} catch {
		// Best-effort persistence; the in-memory toggle still applied.
	}
}
