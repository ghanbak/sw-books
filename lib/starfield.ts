/**
 * The no-cover face: a deterministic starfield, seeded by the book title so a book always
 * gets the same sky. Pure — the 2D face draws it as dots (components/holo-cover.tsx) and the
 * 3D stage rasterizes the same stars into a texture (lib/holo3d/runtime/textures.ts), so the
 * HoloFace → 3D swap doesn't move a single star.
 */

/** Position as a fraction of the cover (0..1, top-left origin); radius/alpha per star. */
export type Star = {
	x: number;
	y: number;
	/** Radius as a fraction of the cover WIDTH. */
	r: number;
	/** Brightness 0..1. */
	a: number;
};

/** Smallest dot the 2D face draws, in points — sub-point stars vanish on thumbs. */
export const MIN_STAR_RADIUS_PT = 0.5;

function hashSeed(seed: string): number {
	let hash = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/** mulberry32 — small, fast, good enough for a sky. */
function rng(seed: number): () => number {
	let t = seed;
	return () => {
		t = (t + 0x6d2b79f5) | 0;
		let x = Math.imul(t ^ (t >>> 15), 1 | t);
		x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fewer stars on small thumbs so they read as a sky, not noise. */
export function starCount(coverWidth: number): number {
	return Math.min(48, Math.round(14 + coverWidth * 0.15));
}

export function starfield(seed: string, coverWidth: number): Star[] {
	const next = rng(hashSeed(seed));
	const stars: Star[] = [];
	for (let i = starCount(coverWidth); i > 0; i--) {
		const size = next();
		stars.push({
			x: next(),
			y: next(),
			// Mostly pinpricks, a few brighter stars (cubed skews small).
			r: 0.003 + size * size * size * 0.008,
			a: 0.35 + next() * 0.65,
		});
	}
	return stars;
}

/** Title and author sizes for the no-cover face (title 1.75× the old 13pt at hero size). */
export function noCoverType(coverWidth: number) {
	return {
		title: Math.min(23, Math.max(9, Math.round(coverWidth * 0.105))),
		author: Math.min(11, Math.max(7, Math.round(coverWidth * 0.05))),
		inset: Math.max(6, Math.round(coverWidth * 0.07)),
		bottom: Math.max(8, Math.round(coverWidth * 0.055)),
	};
}
