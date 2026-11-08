import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

/** WCAG 2.x contrast ratio of two opaque colors. */
function ratio(first: Rgb, second: Rgb): number {
	const a = luminance(first);
	const b = luminance(second);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** WCAG 2.x contrast ratio of `fg` (may be translucent) drawn on an opaque surface. */
function contrast(fg: string, surface: Rgb): number {
	return ratio(over(fg, surface), surface);
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

describe('OwnedBadge neutral style', () => {
	const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');
	const parts = read('components/shelf-scan-parts.tsx');
	const review = read('components/shelf-scan-review.tsx');

	const styleBlock = (name: string) =>
		parts.match(new RegExp(`\\b${name}:\\s*\\{([^}]*)\\}`))?.[1] ?? '';

	/** The real color a style prop resolves to, read from the component source. */
	function styleColor(block: string, prop: string): string {
		const match = block.match(new RegExp(`\\b${prop}:\\s*tokens\\.(\\w+)\\.(\\w+)`));
		if (!match) throw new Error(`${prop} does not reference a token`);
		return (tokens as unknown as Record<string, Record<string, string>>)[match[1]][match[2]];
	}

	const badge = styleBlock('badge');
	const fill = styleColor(badge, 'backgroundColor');
	const label = parse(styleColor(styleBlock('text'), 'color')).rgb;

	// Owned rows dim as a group, so the pill and its label both fade toward the row's backdrop.
	const rowOpacity = Number(review.match(/\browOwned:\s*\{\s*opacity:\s*([\d.]+)/)?.[1] ?? 1);
	const overlayOnBlack = over(tokens.surface.overlay, [0, 0, 0]);

	const placements = [
		['alternates sheet on surface.card', card, 1],
		['owned row on the overlay over a black frame', overlayOnBlack, rowOpacity],
		['owned row on the overlay over a white frame', overlayOnWhite, rowOpacity],
	] as const;

	const rendered = (surface: Rgb, opacity: number) => {
		const dim = (rgb: Rgb) => rgb.map((c, i) => c * opacity + surface[i] * (1 - opacity)) as Rgb;
		return { pill: dim(over(fill, surface)), text: dim(label) };
	};

	it.each(placements)('label meets 4.5:1 in the %s', (_name, surface, opacity) => {
		const { pill, text } = rendered(surface, opacity);
		expect(ratio(text, pill)).toBeGreaterThanOrEqual(4.5);
	});

	it.each(placements)('fill stays distinct from the %s', (_name, surface, opacity) => {
		expect(ratio(rendered(surface, opacity).pill, surface)).toBeGreaterThan(1.05);
	});

	it('uses the neutral style and no Canon or Legends token', () => {
		expect(parts).toMatch(/<View\s+style=\{\s*styles\.badge\s*\}\s*>/);
		expect(parts).toMatch(/<Text\s+style=\{\s*styles\.text\s*\}\s*>/);
		expect(parts).not.toMatch(/tokens\s*\.\s*badge\b/);
		expect(badge).toMatch(/backgroundColor:\s*tokens\.border\.subtle\b/);
		expect(badge).toMatch(/borderColor:\s*tokens\.border\.subtle\b/);
		expect(badge).toMatch(/borderWidth:\s*1\b/);
	});
});
