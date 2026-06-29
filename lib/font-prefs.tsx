import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, createContext, useCallback, useContext, useState } from 'react';
import { Text } from 'react-native';

/**
 * App font preference. The default app font is the readable "High Galactic" alphabet
 * (`sacul-high-alphabet`); flipping the Aurebesh toggle swaps every surface to the Aurebesh
 * glyphs (`sacul-basic`). Both .otf files are registered via `useFonts` in app/_layout.
 *
 * JS `<Text>` picks up the font through a global `Text.defaultProps` style; native chrome
 * (header titles, tab labels, the search field) reads `fontFamily` from this context. The
 * nav stack is re-keyed on the font so already-mounted text reflows to the new font.
 */
const KEY = '@ossus/aurebesh';
export const DEFAULT_FONT = 'sacul-high-alphabet';
export const AUREBESH_FONT = 'sacul-basic';

export const fontFor = (aurebesh: boolean): string => (aurebesh ? AUREBESH_FONT : DEFAULT_FONT);

/** Set the global default font for every JS `<Text>`. */
export function applyGlobalTextFont(aurebesh: boolean): void {
	const T = Text as unknown as { defaultProps?: { style?: unknown } };
	T.defaultProps = T.defaultProps ?? {};
	T.defaultProps.style = { fontFamily: fontFor(aurebesh) };
}

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
		applyGlobalTextFont(on);
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
