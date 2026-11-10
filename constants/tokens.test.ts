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

describe('text on accent.primary (WCAG 1.4.3, 4.5:1)', () => {
	const accent = parse(tokens.accent.primary).rgb;

	it('text.inverse meets 4.5:1', () => {
		expect(contrast(tokens.text.inverse, accent)).toBeGreaterThanOrEqual(4.5);
	});

	it('text.primary is below 4.5:1, so it is not a color for accent fills', () => {
		expect(contrast(tokens.text.primary, accent)).toBeLessThan(4.5);
	});
});

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

const source = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

describe('meaningful non-text UI contrast (WCAG 1.4.11, 3:1)', () => {
	const surfaces = [
		['surface.background', background],
		['surface.card', card],
		['surface.overlay over a white camera frame', overlayOnWhite],
	] as const;

	it.each(surfaces)('text.tertiary meets 3:1 on %s', (_name, surface) => {
		expect(contrast(tokens.text.tertiary, surface)).toBeGreaterThanOrEqual(3);
	});

	it('text.hint is below 3:1, so meaningful graphics cannot use it', () => {
		expect(contrast(tokens.text.hint, background)).toBeLessThan(3);
	});

	it.each([
		[
			'buy-button info icon',
			'components/buy-on-amazon-button.tsx',
			/name="info\.circle"[^>]*?tintColor=\{\s*tokens\.text\.tertiary\s*\}/,
		],
		[
			'profile external-link arrow',
			'app/profile.tsx',
			/name="arrow\.up\.right"[^>]*?color=\{\s*tokens\.text\.tertiary\s*\}/,
		],
		[
			'shelf-scan-review unchecked checkbox border',
			'components/shelf-scan-review.tsx',
			/\bcheckbox:\s*\{[^}]*?borderColor:\s*tokens\.text\.tertiary\b/,
		],
		[
			'timeline-rail inactive tick',
			'components/timeline-rail.tsx',
			/\btick:\s*\{[^}]*?backgroundColor:\s*tokens\.text\.tertiary\b/,
		],
	])('%s uses text.tertiary', (_name, path, pattern) => {
		expect(source(path)).toMatch(pattern);
	});
});

describe('book not-found layout', () => {
	it('renders the full-screen EmptyState, which carries the horizontal padding', () => {
		expect(source('app/book/[id].tsx')).toMatch(
			/<EmptyState\s+message="If an item does not appear in our records, it does not exist\."\s+style=\{styles\.notFound\}\s*\/>/,
		);
		expect(source('components/empty-state.tsx')).toMatch(
			/\bscreen:\s*\{[^}]*?paddingHorizontal:\s*40\b/,
		);
	});

	it('does not override that padding', () => {
		const notFound = source('app/book/[id].tsx').match(/\bnotFound:\s*\{[^}]*\}/)?.[0];
		expect(notFound).toBeDefined();
		expect(notFound).not.toMatch(/padding/);
	});
});
