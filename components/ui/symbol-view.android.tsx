import type { SymbolViewProps } from 'expo-symbols';
import { Image, View } from 'react-native';

import { useMaterialSymbolSource } from '@/hooks/useMaterialSymbolSource';

// The Image tint (SrcIn) keeps only the bitmap's alpha, so seed it opaque and let the tint
// carry the token, alpha included (#435).
const OPAQUE_SEED = '#FFFFFF';

/**
 * Android `SymbolView` whose glyph ignores the system font scale (#441). expo-symbols draws the
 * Material Symbol as `Text` with `fontSize: size` (sp) inside a fixed `size` box, so at 200% font
 * scale the glyph doubles and clips. This draws the same glyph as a bitmap sized in dp (expo-font
 * scales it by density only), like the toolbar and tab bar icons. Same props as expo-symbols'
 * SymbolView; iOS keeps that one (symbol-view.tsx). Weights render regular, as upstream does for
 * string weights. Nothing draws until the bitmap is ready; the box holds its size meanwhile.
 */
export function SymbolView({ name, size = 24, tintColor, style, fallback }: SymbolViewProps) {
	const android = typeof name === 'object' ? (name.android ?? null) : null;
	const source = useMaterialSymbolSource(android, size, OPAQUE_SEED);

	if (!android) return <>{fallback}</>;
	return (
		<View style={[{ width: size, height: size }, style]}>
			{source ? (
				<Image
					source={source}
					resizeMode="contain"
					style={{ width: size, height: size, tintColor }}
				/>
			) : null}
		</View>
	);
}
