import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	type GravitySample,
	REST_TILT,
	TILT_DEAD_ZONE,
	TILT_MAX,
	type TiltState,
	deadZone,
	gravityAngles,
	stepTilt,
	tiltSensorEnabled,
} from './tilt';

const G = 9.81;
/** Gravity for a phone rolled `roll` and pitched `pitch` radians (small-angle decomposition). */
const gravity = (roll: number, pitch: number): GravitySample => {
	const x = Math.sin(roll) * G;
	const y = Math.sin(pitch) * G;
	return { x, y, z: -Math.sqrt(Math.max(0, G * G - x * x - y * y)) };
};
const FLAT = gravity(0, 0);

/** Run `frames` frames of 16 ms with the same sample. */
function run(state: TiltState, sample: GravitySample | null, frames: number, reduce = false) {
	let s = state;
	for (let i = 0; i < frames; i++) s = stepTilt(s, sample, 16, reduce);
	return s;
}

describe('gravityAngles', () => {
	it('reads roll and pitch from the gravity direction, independent of units', () => {
		const a = gravityAngles(gravity(0.2, -0.1));
		expect(a?.roll).toBeCloseTo(0.2, 5);
		expect(a?.pitch).toBeCloseTo(-0.1, 5);
		const g = gravity(0.2, -0.1);
		const inG = gravityAngles({ x: g.x / G, y: g.y / G, z: g.z / G });
		expect(inG?.roll).toBeCloseTo(0.2, 5);
	});

	it('treats a zero or missing sample as no data (simulator, unavailable sensor)', () => {
		expect(gravityAngles(null)).toBeNull();
		expect(gravityAngles({ x: 0, y: 0, z: 0 })).toBeNull();
		expect(gravityAngles({ x: Number.NaN, y: 0, z: -1 })).toBeNull();
	});
});

describe('deadZone', () => {
	it('zeroes tremor and shrinks larger motion without a step', () => {
		expect(deadZone(TILT_DEAD_ZONE * 0.5)).toBe(0);
		expect(deadZone(-TILT_DEAD_ZONE)).toBe(0);
		expect(deadZone(TILT_DEAD_ZONE + 0.05)).toBeCloseTo(0.05, 10);
		expect(deadZone(-(TILT_DEAD_ZONE + 0.05))).toBeCloseTo(-0.05, 10);
	});
});

describe('stepTilt', () => {
	it('seeds the baseline on the first sample, so mounting at any angle starts at rest', () => {
		const s = stepTilt(REST_TILT, gravity(0.5, -0.4), 16, false);
		expect(s.primed).toBe(true);
		expect(s.yaw).toBe(0);
		expect(s.pitch).toBe(0);
	});

	it('follows a quick tilt, eased rather than snapped', () => {
		const primed = stepTilt(REST_TILT, FLAT, 16, false);
		const one = stepTilt(primed, gravity(0.1, 0), 16, false);
		expect(one.yaw).toBeGreaterThan(0);
		const later = run(one, gravity(0.1, 0), 15);
		expect(later.yaw).toBeGreaterThan(one.yaw);
		expect(Math.abs(one.yaw)).toBeLessThan(Math.abs(later.yaw));
	});

	it('pitches opposite to the device pitch delta', () => {
		const primed = stepTilt(REST_TILT, FLAT, 16, false);
		const s = run(primed, gravity(0, 0.1), 20);
		expect(s.pitch).toBeLessThan(0);
	});

	it('clamps the card angle no matter how far the phone turns', () => {
		const primed = stepTilt(REST_TILT, FLAT, 16, false);
		const s = run(primed, gravity(1.2, -1.2 * 0.3), 60);
		expect(Math.abs(s.yaw)).toBeLessThanOrEqual(TILT_MAX);
		expect(Math.abs(s.pitch)).toBeLessThanOrEqual(TILT_MAX);
		expect(Math.abs(s.yaw)).toBeCloseTo(TILT_MAX, 2);
	});

	it('ignores hand tremor inside the dead zone', () => {
		const primed = stepTilt(REST_TILT, FLAT, 16, false);
		const s = run(primed, gravity(TILT_DEAD_ZONE * 0.5, TILT_DEAD_ZONE * 0.5), 30);
		expect(s.yaw).toBe(0);
		expect(s.pitch).toBe(0);
	});

	it('settles back to rest when the phone is held still at a new angle', () => {
		const primed = stepTilt(REST_TILT, FLAT, 16, false);
		const tilted = run(primed, gravity(0.15, 0), 20);
		expect(Math.abs(tilted.yaw)).toBeGreaterThan(0.03);
		const held = run(tilted, gravity(0.15, 0), 60 * 12); // ~12 s
		expect(held.yaw).toBe(0);
	});

	it('eases back to rest and re-primes when the sensor goes away', () => {
		const primed = stepTilt(REST_TILT, FLAT, 16, false);
		const tilted = run(primed, gravity(0.15, 0), 20);
		const gone = run(tilted, null, 60);
		expect(gone.yaw).toBe(0);
		expect(gone.primed).toBe(false);
	});

	it('Reduce Motion returns the static rest pose immediately', () => {
		const primed = stepTilt(REST_TILT, FLAT, 16, false);
		const tilted = run(primed, gravity(0.15, 0.1), 20);
		const reduced = stepTilt(tilted, gravity(0.15, 0.1), 16, true);
		expect(reduced).toEqual(REST_TILT);
		expect(run(REST_TILT, gravity(0.3, 0.3), 30, true)).toEqual(REST_TILT);
	});

	it('survives a long frame gap (resume) without overshooting', () => {
		const primed = stepTilt(REST_TILT, FLAT, 16, false);
		const s = stepTilt(primed, gravity(0.1, 0), 60_000, false);
		expect(Math.abs(s.yaw)).toBeLessThanOrEqual(TILT_MAX);
		expect(Number.isFinite(s.yaw)).toBe(true);
	});
});

describe('tiltSensorEnabled', () => {
	it('registers the sensor only while motion is allowed and the stage is live', () => {
		expect(tiltSensorEnabled(false, false)).toBe(true);
		expect(tiltSensorEnabled(true, false)).toBe(false);
		expect(tiltSensorEnabled(false, true)).toBe(false);
	});
});

// Vitest is node-only (no render tests): assert the wiring in source.
function source(rel: string): string {
	return readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');
}

describe('tilt wiring', () => {
	it('the canvas registers the gravity sensor, gated on Reduce Motion + pause', () => {
		const src = source('components/holo-stage-canvas.tsx');
		expect(src).toContain('useAnimatedSensor(SensorType.GRAVITY');
		expect(src).toContain('tiltSensorEnabled(props.reduceMotion, props.paused)');
		expect(src).toContain('getGravity:');
	});

	it('the stage steps the helper with the Reduce Motion flag and applies it to the cards', () => {
		const src = source('lib/holo3d/runtime/stage.ts');
		expect(src).toMatch(/stepTilt\(\s*tilt,[\s\S]*?reduceMotion,\s*\)/);
		expect(src).toContain('card.mesh.rotation.x = tilt.pitch');
		expect(src).toContain('t.rotationY + tilt.yaw');
	});
});
