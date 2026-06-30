import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, createContext, useCallback, useContext, useState } from 'react';

/**
 * App font preference. The Sacul typeface has been reverted — the app renders in the system
 * default font. The .otf files (sacul-high-alphabet / sacul-basic) stay bundled and the
 * Aurebesh plumbing remains in place, but `AUREBESH_ENABLED` is false so no custom family is
 * ever applied (even if the flag was previously persisted on) and the Profile toggle is
 * disabled. To bring it back: set AUREBESH_ENABLED true and point DEFAULT_FONT at the family.
 *
 * Text reads `fontFamily` from this context (shared <Text> wrapper + native chrome). With the
 * default `undefined`, every surface falls back to the system font.
 */
const KEY = '@ossus/aurebesh';
export const AUREBESH_ENABLED = false;
export const DEFAULT_FONT: string | undefined = undefined;
export const AUREBESH_FONT = 'sacul-basic';

export const fontFor = (aurebesh: boolean): string | undefined =>
	AUREBESH_ENABLED && aurebesh ? AUREBESH_FONT : DEFAULT_FONT;

/** Read the persisted Aurebesh flag (used to gate the splash before the first paint). */
export async function loadAurebeshPref(): Promise<boolean> {
	try {
		return (await AsyncStorage.getItem(KEY)) === '1';
	} catch {
		return false;
	}
}

type FontPref = {
	aurebesh: boolean;
	fontFamily: string | undefined;
	setAurebesh: (on: boolean) => void;
};

const FontContext = createContext<FontPref>({
	aurebesh: false,
	fontFamily: DEFAULT_FONT,
	setAurebesh: () => {},
});

/** Seeded with the already-hydrated pref (app/_layout reads it before revealing the UI). */
export function FontProvider({
	initialAurebesh,
	children,
}: {
	initialAurebesh: boolean;
	children: ReactNode;
}) {
	const [aurebesh, setAurebeshState] = useState(initialAurebesh);

	const setAurebesh = useCallback((on: boolean) => {
		setAurebeshState(on);
		AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
	}, []);

	return (
		<FontContext.Provider value={{ aurebesh, fontFamily: fontFor(aurebesh), setAurebesh }}>
			{children}
		</FontContext.Provider>
	);
}

export function useFontPref(): FontPref {
	return useContext(FontContext);
}
