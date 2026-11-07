import { type AndroidSymbol, unstable_getMaterialSymbolSourceAsync } from 'expo-symbols';
import { useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { tokens } from '@/constants/tokens';

/**
 * Android-only: renders a Material Symbol to an image source for APIs that drop SF Symbols on
 * Android (e.g. `Stack.Toolbar.Menu`'s root icon). Returns `undefined` on other platforms and
 * until the glyph has rendered, and when `symbol` is null (skip the render). Toolbar icons are template-tinted, so `color` only seeds the bitmap.
 */
export function useMaterialSymbolSource(
	symbol: AndroidSymbol | null,
	size = 24,
	color = tokens.text.primary,
): ImageSourcePropType | undefined {
	const [source, setSource] = useState<ImageSourcePropType>();

	useEffect(() => {
		if (process.env.EXPO_OS !== 'android' || !symbol) return;
		let cancelled = false;
		unstable_getMaterialSymbolSourceAsync(symbol, size, color)
			.then((image) => {
				if (!cancelled && image) setSource(image);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [symbol, size, color]);

	return source;
}
