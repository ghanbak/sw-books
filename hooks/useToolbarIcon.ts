import type { ImageSourcePropType } from 'react-native';

import { useMaterialSymbolSource } from '@/hooks/useMaterialSymbolSource';
import { ANDROID_TOOLBAR_SYMBOLS, type ToolbarSymbol } from '@/lib/android-toolbar-symbols';

/**
 * `Stack.Toolbar` icon for an SF Symbol: the name itself on iOS, its mapped Material Symbol
 * image on Android. `undefined` on Android until the glyph has rendered — gate the item on it,
 * since expo-router's Android toolbar drops (and warns about) items without an image icon.
 */
export function useToolbarIcon(
	symbol: ToolbarSymbol,
): ToolbarSymbol | ImageSourcePropType | undefined {
	const androidSource = useMaterialSymbolSource(ANDROID_TOOLBAR_SYMBOLS[symbol]);
	return process.env.EXPO_OS === 'android' ? androidSource : symbol;
}
