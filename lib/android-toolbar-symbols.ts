import type { AndroidSymbol } from 'expo-symbols';

/**
 * Android glyphs for the SF Symbols used as `Stack.Toolbar` icons. SF names stay the source of
 * truth (iOS renders them as-is); Android's toolbar only takes image sources, so each name maps
 * to a Material Symbol rendered to an image. The bundled Material font has no fill axis, so
 * on/off pairs use distinct glyphs where one exists; otherwise the active tint carries the state.
 */
export const ANDROID_TOOLBAR_SYMBOLS = {
	'line.3.horizontal.decrease': 'filter_list',
	'barcode.viewfinder': 'barcode_scanner',
	'person.crop.circle': 'account_circle',
	star: 'star',
	'star.fill': 'star',
	'plus.circle': 'add_circle',
	'checkmark.circle.fill': 'check_circle',
	bookmark: 'bookmark',
	'bookmark.fill': 'bookmark_added',
	book: 'book',
	'book.fill': 'book',
} as const satisfies Record<string, AndroidSymbol>;

export type ToolbarSymbol = keyof typeof ANDROID_TOOLBAR_SYMBOLS;
