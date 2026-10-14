import { Text as RNText, type TextProps } from 'react-native';

import { useFontPref } from '@/lib/font-prefs';

/**
 * App Text. Merges the active app font from the font context (currently the system font —
 * see lib/font-prefs.tsx) UNDER each instance's own style, so every `<Text>` swaps fonts
 * reactively. Use this instead of react-native's `Text`.
 *
 * Instance styles still win per-property — e.g. the mono ISBN blocks that set their own
 * `fontFamily` keep it. (react-native's `Text.defaultProps.style` can't do this: a passed
 * `style` replaces the default rather than merging, so styled text never picked up the font.)
 */
export function Text({ style, ...props }: TextProps) {
	const { fontFamily } = useFontPref();
	return <RNText style={[{ fontFamily }, style]} {...props} />;
}
