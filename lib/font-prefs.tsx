import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, createContext, useCallback, useContext, useState } from 'react';

/**
 * App font preference. The default app font is the readable "High Galactic" alphabet
 * (`sacul-high-alphabet`); flipping the Aurebesh toggle swaps every surface to the Aurebesh
 * glyphs (`sacul-basic`). Both .otf files are registered via `useFonts` in app/_layout.
 *
 * Everything reads `fontFamily` from this context: JS text via the shared `<Text>` wrapper
 * (components/ui/text), and native chrome (header titles, tab labels, the search field)
 * directly. Context-driven, so toggling swaps every surface live with no remount.
 */
const KEY = '@ossus/aurebesh';
export const DEFAULT_FONT = 'sacul-high-alphabet';
export const AUREBESH_FONT = 'sacul-basic';

export const fontFor = (aurebesh: boolean): string => (aurebesh ? AUREBESH_FONT : DEFAULT_FONT);

/** Read the persisted Aurebesh flag (used to gate the splash before the first paint). */
export async function loadAurebeshPref(): Promise<boolean> {
	try {
		return (await AsyncStorage.getItem(KEY)) === '1';
	} catch {
		return false;
	}
}

type FontPref = { aurebesh: boolean; fontFamily: string; setAurebesh: (on: boolean) => void };

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
