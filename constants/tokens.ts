/**
 * Design tokens for the SW Books app.
 *
 * All UI colors should reference these tokens — no hardcoded hex values
 * in screen or component files. This enables future theming
 * (Sith red, Mandalorian green, Rebel orange, etc.).
 */

export const tokens = {
	accent: {
		primary: '#4A90D9', // lightsaber blue — buttons, active states, toggles
		secondary: '#FFE81F', // Star Wars yellow — scanner, emphasis
	},
	surface: {
		background: '#0A0A0C', // near-black, main background
		card: '#1A1A1E', // elevated surfaces, cards, inputs
		overlay: 'rgba(0,0,0,0.88)', // modal/overlay backgrounds
	},
	border: {
		subtle: 'rgba(255,255,255,0.08)', // dividers, inactive borders
		accent: 'rgba(74,144,217,0.3)', // blue-tinted borders
	},
	text: {
		primary: '#ECEDEE', // main text
		secondary: 'rgba(255,255,255,0.6)', // supporting text
		hint: 'rgba(255,255,255,0.3)', // placeholder, metadata
		inverse: '#0A0A0C', // text on accent-colored buttons
	},
	badge: {
		canon: '#1a3a5c',
		legends: '#5c3a1a',
	},
	status: {
		error: '#CC4444',
		success: '#4A90D9',
	},
} as const;

export type AppTheme = typeof tokens;

/**
 * Returns the current theme tokens.
 * Hardcoded to Jedi Blue for now — will support theme selection in V2.
 */
export function useTheme(): AppTheme {
	return tokens;
}
