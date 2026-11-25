/**
 * Android's native-stack header is an AppCompat `Toolbar`, whose default title text appearance is
 * `abc_text_size_title_material_toolbar` = 20dp, so it ignores the system font scale. Passing an
 * explicit `fontSize` makes react-native-screens call `TextView.setTextSize(float)`, which takes
 * sp: the same 20 then follows the font scale (non-linearly on Android 14+, as native apps do).
 * The value is unscaled on purpose; multiplying by `fontScale` here would scale it twice.
 */
export const ANDROID_HEADER_TITLE_SIZE_SP = 20;

type HeaderTitleStyle = { fontFamily: string | undefined; fontSize?: number };

/** iOS returns `{ fontFamily }` only, so UIKit keeps its own Dynamic Type title sizing. */
export function headerTitleStyle(fontFamily: string | undefined, os: string): HeaderTitleStyle {
	if (os !== 'android') return { fontFamily };
	return { fontFamily, fontSize: ANDROID_HEADER_TITLE_SIZE_SP };
}
