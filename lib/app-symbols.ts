import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

/**
 * Material Symbol for each SF Symbol the app passes to `SymbolView`. SF names stay the source of
 * truth (iOS reads `name.ios` exactly as before); expo-symbols has no Android fallback for SF
 * names, so without the `android` half the glyph renders blank there (#430).
 */
export const ANDROID_SYMBOLS = {
	'arrow.left.arrow.right': 'swap_horiz',
	'arrow.up.forward.app': 'open_in_new',
	book: 'book',
	'building.columns': 'account_balance',
	calendar: 'calendar_today',
	checkmark: 'check',
	'chevron.forward': 'chevron_right',
	'clock.arrow.circlepath': 'history',
	film: 'movie',
	'list.bullet': 'format_list_bulleted',
	magnifyingglass: 'search',
	number: 'tag',
	'square.grid.2x2': 'grid_view',
	'square.stack.3d.up': 'stacks',
	tv: 'tv',
	xmark: 'close',
} as const satisfies Partial<Record<SFSymbol, AndroidSymbol>>;

export type AppSymbol = keyof typeof ANDROID_SYMBOLS;

type SymbolName = { ios: AppSymbol; android: AndroidSymbol };

// One frozen object per symbol, so `name` keeps a stable identity across renders.
const NAMES = Object.fromEntries(
	Object.entries(ANDROID_SYMBOLS).map(([ios, android]) => [ios, Object.freeze({ ios, android })]),
) as Record<AppSymbol, SymbolName>;

/** `SymbolView` `name` for an SF Symbol: the SF name on iOS, its Material twin on Android. */
export function symbolName(sf: AppSymbol): SymbolName {
	return NAMES[sf];
}
