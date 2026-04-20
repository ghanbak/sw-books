import { Platform } from 'react-native';
import { tokens } from './tokens';

export const Colors = {
	light: {
		text: tokens.text.primary,
		background: tokens.surface.background,
		tint: tokens.accent.primary,
		icon: tokens.text.hint,
		tabIconDefault: tokens.text.hint,
		tabIconSelected: tokens.accent.primary,
	},
	dark: {
		text: tokens.text.primary,
		background: tokens.surface.background,
		tint: tokens.accent.primary,
		icon: tokens.text.hint,
		tabIconDefault: tokens.text.hint,
		tabIconSelected: tokens.accent.primary,
	},
};

export const Fonts = Platform.select({
	ios: {
		sans: 'system-ui',
		serif: 'ui-serif',
		rounded: 'ui-rounded',
		mono: 'ui-monospace',
	},
	default: {
		sans: 'normal',
		serif: 'serif',
		rounded: 'normal',
		mono: 'monospace',
	},
	web: {
		sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
		serif: "Georgia, 'Times New Roman', serif",
		rounded:
			"'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
		mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
	},
});
