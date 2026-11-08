import { describe, expect, it } from 'vitest';

import { tokens } from '@/constants/tokens';

type Rgb = [number, number, number];

function parse(color: string): { rgb: Rgb; alpha: number } {
	const hex = color.match(/^#([0-9a-f]{6})$/i);
	if (hex) {
		const n = Number.parseInt(hex[1], 16);
		return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
	}
	const rgba = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
	if (rgba) {
		return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: Number(rgba[4]) };
	}
	throw new Error(`Unsupported color: ${color}`);
}

/** Alpha-composite `top` over an opaque `bottom`. */
function over(top: string, bottom: Rgb): Rgb {
	const { rgb, alpha } = parse(top);
	return rgb.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as Rgb;
}

function luminance(rgb: Rgb): number {
	const [r, g, b] = rgb.map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio of `fg` (may be translucent) drawn on an opaque surface. */
function contrast(fg: string, surface: Rgb): number {
	const a = luminance(over(fg, surface));
	const b = luminance(surface);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const background = parse(tokens.surface.background).rgb;
const card = parse(tokens.surface.card).rgb;
// Scanner screens draw the overlay over a live camera feed; a white frame is the worst case.
const overlayOnWhite = over(tokens.surface.overlay, [255, 255, 255]);

describe('text.tertiary contrast (WCAG 1.4.3, 4.5:1)', () => {
	it.each([
		['surface.background', background],
		['surface.card', card],
		['surface.overlay over a white camera frame', overlayOnWhite],
	] as const)('meets 4.5:1 on %s', (_name, surface) => {
		expect(contrast(tokens.text.tertiary, surface)).toBeGreaterThanOrEqual(4.5);
	});

	it('stays quieter than text.secondary', () => {
		expect(contrast(tokens.text.tertiary, background)).toBeLessThan(
			contrast(tokens.text.secondary, background),
		);
	});

	it('text.hint is below 4.5:1, so it is not a text color', () => {
		expect(contrast(tokens.text.hint, background)).toBeLessThan(4.5);
	});
});
