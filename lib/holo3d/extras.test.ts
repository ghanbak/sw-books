import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	DROPOUT_CYCLE_S,
	DROPOUT_SWEEP_S,
	FRINGE_BASE,
	FRINGE_MAX,
	PARTICLE_COUNT,
	STILL_EXTRAS,
	dropoutBand,
	extrasFrame,
	fringeOffset,
	hash01,
	holoFlicker,
} from './extras';

/** Sample `dropoutBand` every `step` seconds over `seconds`. */
const sampleBands = (seconds: number, step = 1 / 60) => {
	const out: { t: number; center: number; strength: number }[] = [];
	for (let t = 0; t < seconds; t += step) out.push({ t, ...dropoutBand(t) });
	return out;
};

describe('hash01', () => {
	it('is deterministic and stays in [0, 1)', () => {
		for (let n = -50; n < 500; n++) {
			const h = hash01(n);
			expect(h).toBe(hash01(n));
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThan(1);
		}
	});
});

describe('holoFlicker', () => {
	it('is a subtle shimmer (never more than ±5% off full brightness)', () => {
		for (let t = 0; t < 30; t += 0.013) {
			const f = holoFlicker(t);
			expect(f).toBeGreaterThanOrEqual(0.9);
			expect(f).toBeLessThanOrEqual(1);
		}
	});
});

describe('dropoutBand', () => {
	const samples = sampleBands(DROPOUT_CYCLE_S * 40);

	it('is off most of the time (bands are rare)', () => {
		const on = samples.filter((s) => s.strength > 0).length / samples.length;
		expect(on).toBeGreaterThan(0);
		expect(on).toBeLessThan(DROPOUT_SWEEP_S / DROPOUT_CYCLE_S + 0.01);
	});

	it('shows at most one band per cycle, and skips some cycles', () => {
		const perCycle = new Map<number, number>();
		let prevOn = false;
		for (const s of samples) {
			const on = s.strength > 0;
			if (on && !prevOn) {
				const cycle = Math.floor(s.t / DROPOUT_CYCLE_S);
				perCycle.set(cycle, (perCycle.get(cycle) ?? 0) + 1);
			}
			prevOn = on;
		}
		for (const count of perCycle.values()) expect(count).toBe(1);
		expect(perCycle.size).toBeGreaterThan(10);
		expect(perCycle.size).toBeLessThan(40);
	});

	it('sweeps bottom → top with a soft envelope', () => {
		const on = samples.filter((s) => s.strength > 0);
		for (const s of on) {
			expect(s.center).toBeGreaterThanOrEqual(0);
			expect(s.center).toBeLessThanOrEqual(1);
			expect(s.strength).toBeLessThanOrEqual(1);
			// Eased: weak at the ends of the sweep, strongest mid-card.
			if (s.center < 0.05 || s.center > 0.95) expect(s.strength).toBeLessThan(0.2);
		}
	});

	it('reports no band while off, and for invalid time', () => {
		for (const s of samples.filter((x) => x.strength === 0)) expect(s.center).toBe(-1);
		expect(dropoutBand(Number.NaN)).toEqual({ center: -1, strength: 0 });
		expect(dropoutBand(-1)).toEqual({ center: -1, strength: 0 });
	});
});

describe('extrasFrame', () => {
	it('Reduce Motion: no flicker, band or particles, at any time', () => {
		for (const t of [0, 1.234, 50, 9999]) expect(extrasFrame(t, true)).toEqual(STILL_EXTRAS);
		expect(STILL_EXTRAS).toEqual({
			flicker: 1,
			bandCenter: -1,
			bandStrength: 0,
			particles: false,
			fringe: 0,
		});
	});

	it('motion on turns the fringe on; Reduce Motion turns it fully off', () => {
		expect(extrasFrame(3, false).fringe).toBe(1);
		expect(extrasFrame(3, true).fringe).toBe(0);
	});

	it('writes into a reused `out` object (no per-frame allocation)', () => {
		const out = { ...STILL_EXTRAS };
		expect(extrasFrame(2, false, out)).toBe(out);
		expect(out.particles).toBe(true);
		expect(extrasFrame(2, true, out)).toBe(out);
		expect(out).toEqual(STILL_EXTRAS);
		const band = { center: 0, strength: 0 };
		expect(dropoutBand(1, band)).toBe(band);
		expect(dropoutBand(Number.NaN, band)).toEqual({ center: -1, strength: 0 });
	});

	it('motion on: flicker animates, particles draw, band follows dropoutBand', () => {
		const a = extrasFrame(1, false);
		const b = extrasFrame(1.1, false);
		expect(a.particles).toBe(true);
		expect(a.flicker).not.toBe(b.flicker);
		const band = sampleBands(DROPOUT_CYCLE_S * 3).find((s) => s.strength > 0);
		expect(band).toBeDefined();
		if (band) {
			const f = extrasFrame(band.t, false);
			expect(f.bandCenter).toBe(band.center);
			expect(f.bandStrength).toBe(band.strength);
		}
	});
});

describe('fringeOffset', () => {
	it('is a fixed hairline at rest, widening (capped) as the card turns', () => {
		expect(fringeOffset(0, 0)).toBe(FRINGE_BASE);
		expect(fringeOffset(0.1, 0)).toBeGreaterThan(FRINGE_BASE);
		expect(fringeOffset(-0.1, 0)).toBe(fringeOffset(0.1, 0));
		expect(fringeOffset(Math.PI, Math.PI)).toBe(FRINGE_MAX);
		expect(fringeOffset(Number.NaN, Number.POSITIVE_INFINITY)).toBe(FRINGE_BASE);
	});

	it('stays a hairline: never wider than ~2.5pt on a 200pt card', () => {
		expect(FRINGE_MAX * 200).toBeLessThanOrEqual(2.5);
	});
});

describe('particle budget', () => {
	it('keeps the mote count small (one instanced draw)', () => {
		expect(PARTICLE_COUNT).toBeGreaterThan(0);
		expect(PARTICLE_COUNT).toBeLessThanOrEqual(64);
	});
});

describe('wiring', () => {
	const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
	const stage = read('runtime/stage.ts');
	const scene = read('runtime/scene.ts');

	it('the stage drives the scene from extrasFrame and fringeOffset', () => {
		expect(stage).toMatch(/extrasFrame\(\s*[^)]*reduceMotion/);
		expect(stage).toMatch(/fringeOffset\(/);
		expect(stage).toMatch(/clock\.band\.value/);
		expect(stage).toMatch(/motes\.visible\s*=/);
	});

	it('Reduce Motion gates the fringe off (not just to zero width)', () => {
		// The shader multiplies the fringe by the gate uniform…
		expect(scene).toMatch(/\.sub\(mask\),\s*0\)\.mul\(clock\.fringeOn\)/g);
		expect(scene.match(/\.mul\(clock\.fringeOn\)/g)?.length).toBe(2);
		expect(scene).toMatch(/fringeOn:\s*makeFloat\(0\)/);
		// …and the stage drives it from the extras frame and from STILL_EXTRAS.
		expect(stage).toMatch(/clock\.fringeOn\.value\s*=\s*extras\.fringe/);
		expect(stage).toMatch(/clock\.fringeOn\.value\s*=\s*STILL_EXTRAS\.fringe/);
	});

	it('the scene builds the motes from PARTICLE_COUNT and keeps them out of bloom', () => {
		expect(scene).toMatch(/new InstancedMesh\([\s\S]{0,160}?PARTICLE_COUNT,?\s*\)/);
		const motes = scene.slice(
			scene.indexOf('function makeMotes'),
			scene.indexOf('function makeProjector'),
		);
		expect(motes).toMatch(/bloomIntensity:\s*float\(0\)/);
		expect(scene).toMatch(/setFringe/);
	});

	it('imports three only from three/webgpu (plus tsl / addons), never bare three', () => {
		for (const src of [stage, scene]) {
			expect(src).not.toMatch(/from 'three'/);
		}
	});
});
