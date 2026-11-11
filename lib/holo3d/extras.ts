/**
 * Hologram look extras — chromatic fringe, flicker / dropout bands, particles. Pure math, no
 * three.js, safe for Vitest; the stage feeds the results into scene uniforms each frame.
 *
 * Tactile, not theatrical: each effect sits at the edge of notice. The cover art itself is never
 * shifted or blurred — the fringe lives outside the card's edge, a dropout band only dims.
 */

/** Chromatic fringe at rest (card units; the unscaled card is 1 wide, so 0.006 ≈ 1pt at 200pt). */
export const FRINGE_BASE = 0.006;
/** Extra fringe per radian the card is turned away from the viewer (pager swipe, gyro tilt). */
export const FRINGE_GAIN = 0.03;
/** Fringe never exceeds this (card units), however far the card turns. */
export const FRINGE_MAX = 0.012;

/** Dropout bands: at most one per cycle (seconds), and some cycles skip theirs. */
export const DROPOUT_CYCLE_S = 7;
/** How long one band takes to sweep the card bottom → top (seconds). */
export const DROPOUT_SWEEP_S = 0.8;
/** Fraction of cycles that get no band, so the rhythm doesn't read as a metronome. */
export const DROPOUT_SKIP = 0.3;

/** Rising motes in the projector beam: one instanced draw, positions computed on the GPU. */
export const PARTICLE_COUNT = 48;

export type ExtrasFrame = {
	/** Whole-card brightness multiplier (≈ 0.91–0.99 animated, exactly 1 at rest). */
	flicker: number;
	/** Dropout band centre in card v (0 = bottom, 1 = top), or -1 when no band is showing. */
	bandCenter: number;
	/** Band strength 0–1 (eased in and out over the sweep). */
	bandStrength: number;
	/** Whether the particle mesh draws. */
	particles: boolean;
	/** Chromatic fringe gate: 1 = on, 0 = fully off (no residual ring). */
	fringe: number;
};

/** Reduce Motion (or a frozen clock): a plain still card — no flicker, band, particles or fringe. */
export const STILL_EXTRAS: Readonly<ExtrasFrame> = Object.freeze({
	flicker: 1,
	bandCenter: -1,
	bandStrength: 0,
	particles: false,
	fringe: 0,
});

export type DropoutBand = { center: number; strength: number };

/** Deterministic 0–1 hash of an integer (no Math.random: frames must be reproducible). */
export function hash01(n: number): number {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return s - Math.floor(s);
}

/** Soft two-sine brightness shimmer — the tuned v2 flicker. */
export function holoFlicker(t: number): number {
	return 0.95 + Math.sin(t * 23) * Math.sin(t * 7.3) * 0.04;
}

/**
 * The dropout band at time `t` (seconds): a soft dim band that occasionally sweeps up the card.
 * Pass `out` to write into a reused object (the frame loop does, so it allocates nothing).
 */
export function dropoutBand(
	t: number,
	out: DropoutBand = { center: -1, strength: 0 },
): DropoutBand {
	out.center = -1;
	out.strength = 0;
	if (!Number.isFinite(t) || t < 0) return out;
	const cycle = Math.floor(t / DROPOUT_CYCLE_S);
	if (hash01(cycle * 2 + 1) < DROPOUT_SKIP) return out;
	const start = hash01(cycle * 2) * (DROPOUT_CYCLE_S - DROPOUT_SWEEP_S);
	const local = t - cycle * DROPOUT_CYCLE_S - start;
	if (local < 0 || local > DROPOUT_SWEEP_S) return out;
	const p = local / DROPOUT_SWEEP_S;
	out.center = p;
	out.strength = Math.sin(Math.PI * p);
	return out;
}

const bandScratch: DropoutBand = { center: -1, strength: 0 };

/** Per-frame extras for clock time `t` (seconds). Pass `out` to reuse an object across frames. */
export function extrasFrame(
	t: number,
	reduceMotion: boolean,
	out: ExtrasFrame = { ...STILL_EXTRAS },
): ExtrasFrame {
	if (reduceMotion) return Object.assign(out, STILL_EXTRAS);
	const band = dropoutBand(t, bandScratch);
	out.flicker = holoFlicker(t);
	out.bandCenter = band.center;
	out.bandStrength = band.strength;
	out.particles = true;
	out.fringe = 1;
	return out;
}

/**
 * Fringe width for a card turned `yaw` / `pitch` radians from facing the viewer: a fixed hairline
 * at rest that widens a touch as the card turns, like lens dispersion. Static when the card is.
 */
export function fringeOffset(yaw: number, pitch: number): number {
	const turn = Math.hypot(Number.isFinite(yaw) ? yaw : 0, Number.isFinite(pitch) ? pitch : 0);
	return Math.min(FRINGE_MAX, FRINGE_BASE + turn * FRINGE_GAIN);
}
