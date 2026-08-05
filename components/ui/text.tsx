import { Text as RNText, type TextProps } from 'react-native';

import { useFontPref } from '@/lib/font-prefs';

/**
 * App Text. Merges the active app font (default High Galactic `sacul-high-alphabet`, or
 * Aurebesh `sacul-basic` when toggled) UNDER each instance's own style, so every `<Text>`
 * swaps fonts reactively via the font context. Use this instead of react-native's `Text`.
 *
 * Instance styles still win per-property — e.g. the mono ISBN blocks that set their own
 * `fontFamily` keep it. (react-native's `Text.defaultProps.style` can't do this: a passed
 * `style` replaces the default rather than merging, so styled text never picked up the font.)
 */
export function Text({ style, ...props }: TextProps) {
	const { fontFamily } = useFontPref();
	return <RNText style={[{ fontFamily }, style]} {...props} />;
}
