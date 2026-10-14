/**
 * Design tokens for the OssusArchives app.
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
	// Timeline rail: film/TV marker pills that float over the hologram glow.
	rail: {
		anchorPill: 'rgba(0,0,0,0.55)',
		anchorStem: 'rgba(255,255,255,0.18)',
	},
	// Hologram cover projection (HoloCover): cyan beam + glowing base emitter.
	holo: {
		cyan: '#3DE0FF',
		beam: 'rgba(61,224,255,0.15)',
		emitter: 'rgba(61,224,255,0.55)',
		// projected-cover face treatment (Figma node 134:2077): blue tint, scanlines, glow.
		// The cover is desaturated and hard-light blended over this tint, so the design's
		// strong alphas read as a vivid blue hologram rather than washing the art out.
		tintTop: 'rgba(111,195,255,0.9)',
		tintMid: 'rgba(46,140,255,0.8)',
		tintBottom: 'rgba(31,89,178,0.75)',
		scanline: 'rgba(158,224,255,0.12)',
		bloom: 'rgba(111,195,255,0.3)',
		innerGlow: 'rgba(158,224,255,0.56)',
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
