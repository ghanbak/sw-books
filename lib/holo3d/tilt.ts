/**
 * Gyro tilt for the 3D hologram card — pure math, no three.js or Reanimated, safe for Vitest.
 *
 * Input is the gravity vector (Reanimated `SensorType.GRAVITY`, any unit). The card follows how
 * far the phone has moved from where it has been resting, not its absolute angle: a slow
 * baseline tracks the hold posture, so a phone held still at any angle settles back to the
 * rest pose. Tactile, not theatrical — a few degrees, eased, with a dead zone for hand tremor.
 */

export type GravitySample = { x: number; y: number; z: number };

export type TiltState = {
	/** Card rotation applied on top of its layout pose (radians). */
	pitch: number;
	yaw: number;
	/** Slow-moving hold posture (radians) the tilt is measured against. */
	baseRoll: number;
	basePitch: number;
	/** False until the first valid sample seeds the baseline (no jump on mount). */
	primed: boolean;
};

export const REST_TILT: TiltState = { pitch: 0, yaw: 0, baseRoll: 0, basePitch: 0, primed: false };

/** Hard cap on the card's tilt either way (radians, ≈ 8°). */
export const TILT_MAX = 0.14;
/** Card turn per radian of device movement. */
export const TILT_GAIN = 0.6;
/** Device movement ignored as tremor (radians, ≈ 0.6°). */
export const TILT_DEAD_ZONE = 0.01;
/** Follow time constant: how quickly the card catches up with the hand (ms). */
export const TILT_FOLLOW_MS = 90;
/** Baseline time constant: how long a held angle takes to settle back to rest (ms). */
export const TILT_SETTLE_MS = 1600;
/** Below this the rotation is snapped to zero (radians) so a resting card stops redrawing. */
export const TILT_EPSILON = 0.0005;
/** Frame gaps longer than this are treated as this long (resume after a pause). */
const MAX_DT_MS = 100;
/** Gravity magnitudes below this are "no data" (simulator / sensor unavailable reports zeros). */
const MIN_GRAVITY = 1e-3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Exponential approach factor for a frame of `dt` against time constant `tau`. */
const follow = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

/** Shrink `v` toward zero by `zone`, so motion inside the zone reads as zero with no step. */
export function deadZone(v: number, zone = TILT_DEAD_ZONE): number {
	if (Math.abs(v) <= zone) return 0;
	return v - Math.sign(v) * zone;
}

/** Device roll / pitch (radians) from a gravity vector, or null when the sample carries no data. */
export function gravityAngles(
	sample: GravitySample | null,
): { roll: number; pitch: number } | null {
	if (!sample) return null;
	const { x, y, z } = sample;
	if (![x, y, z].every(Number.isFinite)) return null;
	const g = Math.hypot(x, y, z);
	if (g < MIN_GRAVITY) return null;
	return { roll: Math.asin(clamp(x / g, -1, 1)), pitch: Math.asin(clamp(y / g, -1, 1)) };
}

/**
 * Advance the tilt by one frame. Reduce Motion → the rest pose, immediately. No sample (sensor
 * off or unavailable) → eases back to rest and re-seeds the baseline on the next sample.
 */
export function stepTilt(
	state: TiltState,
	sample: GravitySample | null,
	dtMs: number,
	reduceMotion: boolean,
): TiltState {
	if (reduceMotion) return REST_TILT;
	const dt = clamp(Number.isFinite(dtMs) ? dtMs : 0, 0, MAX_DT_MS);
	const angles = gravityAngles(sample);

	let { baseRoll, basePitch, primed } = state;
	let targetYaw = 0;
	let targetPitch = 0;
	if (angles) {
		if (!primed) {
			baseRoll = angles.roll;
			basePitch = angles.pitch;
			primed = true;
		} else {
			const k = follow(dt, TILT_SETTLE_MS);
			baseRoll += (angles.roll - baseRoll) * k;
			basePitch += (angles.pitch - basePitch) * k;
		}
		// Phone rolls right → the card turns to face it (yaw); top tips back → card pitches.
		targetYaw = clamp(deadZone(angles.roll - baseRoll) * TILT_GAIN, -TILT_MAX, TILT_MAX);
		targetPitch = clamp(-deadZone(angles.pitch - basePitch) * TILT_GAIN, -TILT_MAX, TILT_MAX);
	} else {
		primed = false;
	}

	const k = follow(dt, TILT_FOLLOW_MS);
	const snap = (v: number) => (Math.abs(v) < TILT_EPSILON ? 0 : v);
	return {
		yaw: snap(state.yaw + (targetYaw - state.yaw) * k),
		pitch: snap(state.pitch + (targetPitch - state.pitch) * k),
		baseRoll,
		basePitch,
		primed,
	};
}

/** Whether the gravity sensor should be registered: off under Reduce Motion and while paused. */
export function tiltSensorEnabled(reduceMotion: boolean, paused: boolean): boolean {
	return !reduceMotion && !paused;
}
