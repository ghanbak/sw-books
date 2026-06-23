/**
 * Deterministic fallback color for a book with no cover image. Hash the title so a
 * given book always gets the same Dark-Side-themed color. Pure — shared by HoloCover
 * (and the legacy Book3D until it's removed).
 */
const COVER_COLORS = [
	'#8B0000',
	'#1a3a5c',
	'#2d4a22',
	'#4a2545',
	'#5c3a1a',
	'#1a4a4a',
	'#3d2b1f',
	'#4a1a1a',
	'#1a2a4a',
	'#3a1a4a',
] as const;

export function getCoverColor(title: string): string {
	let hash = 0;
	for (let i = 0; i < title.length; i++) {
		hash = (hash << 5) - hash + title.charCodeAt(i);
		hash |= 0;
	}
	return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
}
