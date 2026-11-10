// WCAG 2.x relative luminance and contrast ratio for opaque #rrggbb colours.
// https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio

type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m?.[1]) throw new Error(`Expected #rrggbb, got "${hex}"`);
	const n = Number.parseInt(m[1], 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function channel(c: number): number {
	const s = c / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
	const [r, g, b] = parseHex(hex);
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Composite `top` at `alpha` (0–1) over an opaque `bottom`, e.g. Tailwind's `bg-x/15`. */
export function blend(top: string, alpha: number, bottom: string): string {
	const t = parseHex(top);
	const b = parseHex(bottom);
	return `#${t
		.map((c, i) => Math.round(c * alpha + (b[i] ?? 0) * (1 - alpha)))
		.map((c) => c.toString(16).padStart(2, '0'))
		.join('')}`;
}
