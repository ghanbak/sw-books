import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
	abs,
	color,
	cos,
	dot,
	float,
	fract,
	hash,
	instanceIndex,
	length,
	luminance,
	max,
	min,
	mix,
	mrt,
	normalView,
	oneMinus,
	output,
	pass,
	positionLocal,
	positionViewDirection,
	pow,
	screenUV,
	sin,
	smoothstep,
	step,
	texture,
	uniform,
	uv,
	vec2,
	vec3,
	vertexStage,
} from 'three/tsl';
import {
	AdditiveBlending,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DataTexture,
	DoubleSide,
	Group,
	InstancedMesh,
	Mesh,
	MeshBasicNodeMaterial,
	type Node,
	PerspectiveCamera,
	PlaneGeometry,
	RenderPipeline,
	Scene,
	type Texture,
	type WebGPURenderer,
} from 'three/webgpu';

import { tokens } from '@/constants/tokens';

import { FRINGE_BASE, FRINGE_MAX, PARTICLE_COUNT } from '../extras';
import { CAMERA_FOV_DEG, CAMERA_Z, CARD_ASPECT } from '../pager';

/**
 * The hologram scene: projected cover card(s), projector beam + emitter, selective bloom.
 * All geometry is procedural; the unscaled card is 1 × CARD_ASPECT world units and the stage
 * scales the rig to the on-screen card size.
 *
 * Look (user-tuned in the Phase 0 spike, 2026-10-22): selective MRT bloom — only the card's edge
 * light, the beam and the emitter bloom, so the cover itself stays crisp.
 */
const LOOK = {
	bloomStrength: 0.41,
	bloomRadius: 0.5,
	bloomThreshold: 0,
	edgeBloom: 0.7,
	faceHalo: 0,
	emitterBloom: 2,
	edgeLight: 0.16,
} as const;

const SCANLINES = 25; // ≈ the 2D face's 12pt pitch on a 300pt card
const CORNER = 0.04; // ≈ 8pt on a 200pt card

/**
 * Look extras (#182), each at the edge of notice — tactile, not theatrical. None of them touch
 * the cover pixels' position or sharpness, and none feed the bloom.
 * - Fringe: a red / blue hairline split just outside the card edge (the quad is padded for it).
 * - Dropout band: a soft band that occasionally sweeps up the card, dimming it slightly.
 * - Motes: specks rising through the beam behind the card.
 */
const EXTRAS = {
	fringeAlpha: 0.32,
	bandHalfHeight: 0.04, // card v; ≈ 12pt on a 300pt-tall card
	bandDim: 0.22,
	moteSize: 0.014, // ≈ 3pt on a 200pt card
	moteAlpha: 0.5,
	moteRise: 1.3,
} as const;
/** Quad padding around the card (card units) so the fringe has room outside the edge. */
const FRINGE_PAD = FRINGE_MAX * 2;

/** sRGB token → linear THREE.Color. Alpha is dropped up front (THREE ignores it, with a warning). */
const tokenColor = (value: string) =>
	new Color(value.replace(/^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/, 'rgb($1,$2,$3)'));

/** Frame-driven clock, flicker and dropout band, set from the CPU so Reduce Motion can freeze them. */
export type SceneClock = {
	time: ReturnType<typeof makeFloat>;
	flicker: ReturnType<typeof makeFloat>;
	/** Dropout band centre (card v, -1 = none) and strength (0–1). */
	band: ReturnType<typeof makeFloat>;
	bandStrength: ReturnType<typeof makeFloat>;
	/** Chromatic fringe gate (1 on, 0 fully off — Reduce Motion). */
	fringeOn: ReturnType<typeof makeFloat>;
};
const makeFloat = (v: number) => uniform(v);

export type HoloCard = {
	mesh: Mesh;
	/** `sky` = the no-cover starfield: keeps its black (no projection floor) so stars read. */
	setCover: (cover: Texture | null, kind?: 'cover' | 'sky') => void;
	setFallbackColor: (hex: string) => void;
	setFade: (opacity: number) => void;
	setPressed: (pressed: boolean) => void;
	/** Chromatic fringe width (card units), see `fringeOffset`. */
	setFringe: (offset: number) => void;
};

function makeCard(clock: SceneClock): HoloCard {
	const placeholder = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
	placeholder.needsUpdate = true;
	// The quad is padded by FRINGE_PAD on every side; cardUV is 0–1 over the card itself.
	const cardUV = uv()
		.sub(0.5)
		.mul(vec2(1 + 2 * FRINGE_PAD, (CARD_ASPECT + 2 * FRINGE_PAD) / CARD_ASPECT))
		.add(0.5);
	const coverNode = texture(placeholder, cardUV);
	const hasCover = uniform(0);
	// Projection brightness floor: lifts a cover's blacks into the hologram blue. The starfield
	// keeps its black sky.
	const floor = uniform(0.3);
	const isSky = uniform(0);
	const fallback = uniform(new Color(tokens.badge.canon));
	const fade = uniform(1);
	const pressed = uniform(0);
	const fringe = uniform(FRINGE_BASE);

	// Rounded-rect SDF in card space → alpha mask + inner edge glow.
	const p = cardUV.sub(0.5).mul(vec2(1, CARD_ASPECT));
	const half = vec2(0.5 - CORNER, CARD_ASPECT / 2 - CORNER);
	const q = abs(p).sub(half);
	const dist = length(max(q, 0)).sub(CORNER);
	const mask = oneMinus(smoothstep(-0.004, 0.004, dist));

	// Chromatic fringe: the card's silhouette offset one way in red, the other in blue, kept only
	// where it falls outside the card — the cover itself is never shifted or tinted.
	const shifted = (offset: Node<'vec2'>) =>
		oneMinus(smoothstep(-0.004, 0.006, length(max(abs(p.sub(offset)).sub(half), 0)).sub(CORNER)));
	const fringeDir = vec2(fringe, fringe.mul(0.5));
	// Gated, not just narrowed: at offset 0 the softer `shifted` edge would still leave a ring.
	const red = max(shifted(fringeDir).sub(mask), 0).mul(clock.fringeOn);
	const blue = max(shifted(fringeDir.negate()).sub(mask), 0).mul(clock.fringeOn);
	const fringeColor = vec3(red, red.mul(0.15).add(blue.mul(0.55)), red.mul(0.35).add(blue)); // magenta / cyan-blue
	const fringeAlpha = max(red, blue).mul(EXTRAS.fringeAlpha);

	// Dropout band: a soft horizontal band (off while its centre is -1) that dims the card a touch.
	const band = oneMinus(smoothstep(0, EXTRAS.bandHalfHeight, abs(cardUV.y.sub(clock.band))))
		.mul(clock.bandStrength)
		.mul(EXTRAS.bandDim);
	// `dist` is a constant -CORNER inside the card, so this "edge" glow is really a cyan wash over
	// the whole face — part of the tuned cover look. The starfield needs black, so it uses the
	// exact interior distance (a true rim glow) instead.
	const rimDist = dist.add(min(max(q.x, q.y), 0));
	const rimGlow = oneMinus(smoothstep(0, 0.07, rimDist.negate()));
	const edgeGlow = mix(oneMinus(smoothstep(0, 0.07, dist.negate())), rimGlow, isSky);

	// Luminosity-style projection: keep the cover's brightness, take the hologram's hue.
	const lum = luminance(coverNode.rgb);
	const tinted = mix(
		color(tokenColor(tokens.holo.tintBottom)),
		color(tokenColor(tokens.holo.tintTop)),
		lum,
	).mul(lum.mul(0.9).add(floor));
	const base = mix(fallback.mul(0.8), tinted, hasCover);

	const scan = step(0.5, fract(cardUV.y.mul(SCANLINES).sub(clock.time.mul(0.12))));
	const cyan = color(tokenColor(tokens.holo.cyan));

	const material = new MeshBasicNodeMaterial();
	const face = base
		.mul(scan.mul(0.18).add(0.9))
		.add(cyan.mul(edgeGlow).mul(LOOK.edgeLight))
		.mul(oneMinus(band));
	material.colorNode = mix(fringeColor, face, mask)
		.mul(clock.flicker)
		.mul(pressed.mul(0.25).add(1));
	material.opacityNode = max(mask.mul(0.92), fringeAlpha).mul(fade);
	material.transparent = true;
	material.depthWrite = false;
	material.mrtNode = mrt({
		bloomIntensity: edgeGlow.mul(LOOK.edgeBloom).add(LOOK.faceHalo).mul(mask).mul(fade),
	});

	const mesh = new Mesh(
		new PlaneGeometry(1 + 2 * FRINGE_PAD, CARD_ASPECT + 2 * FRINGE_PAD),
		material,
	);
	return {
		mesh,
		setCover: (cover, kind = 'cover') => {
			coverNode.value = cover ?? placeholder;
			hasCover.value = cover ? 1 : 0;
			const sky = kind === 'sky';
			floor.value = sky ? 0.02 : 0.3;
			isSky.value = sky ? 1 : 0;
			// Drawn after the additive beam, so the beam doesn't show through the black sky.
			mesh.renderOrder = sky ? 1 : 0;
		},
		setFallbackColor: (hex) => {
			fallback.value.set(hex);
		},
		setFade: (opacity) => {
			fade.value = opacity;
		},
		setPressed: (on) => {
			pressed.value = on ? 1 : 0;
		},
		setFringe: (offset) => {
			fringe.value = offset;
		},
	};
}

/**
 * Motes: PARTICLE_COUNT specks drifting up the beam, one instanced draw. Each instance hashes its
 * index into a start phase, speed, radius and twinkle; positions are computed in the vertex
 * shader, so the CPU only advances `time`. They sit behind the card (z < 0), are drawn before it
 * and write no bloom, so they never glow over the cover.
 */
function makeMotes(clock: SceneClock): InstancedMesh {
	const seed = float(instanceIndex); // hash() truncates to uint: keep the three streams 1000 apart
	const r1 = hash(seed);
	const r2 = hash(seed.add(1000));
	const r3 = hash(seed.add(2000));
	const along = fract(r1.add(clock.time.mul(mix(0.05, 0.11, r2)))); // 0 at emitter → 1 at top
	// Spread fast off the emitter so most motes ride the beam edge, beside the card rather than behind it.
	const radius = mix(0.08, 0.8, pow(along, 0.5)).mul(r3.mul(0.5).add(0.5));
	const angle = r2.mul(2 * Math.PI).add(clock.time.mul(r3.sub(0.5).mul(0.3)));
	const centre = vec3(
		cos(angle).mul(radius),
		along.mul(EXTRAS.moteRise).sub(0.95),
		abs(sin(angle)).mul(radius).mul(-0.3).sub(0.08),
	);
	const size = r1.mul(0.6).add(0.6);
	const twinkle = sin(clock.time.mul(r3.mul(3).add(2)).add(r1.mul(2 * Math.PI)))
		.mul(0.3)
		.add(0.7);
	// Fade in off the emitter, out before the top of the beam.
	const life = smoothstep(0, 0.06, along).mul(oneMinus(smoothstep(0.6, 1, along)));

	const material = new MeshBasicNodeMaterial();
	material.positionNode = positionLocal.mul(size).add(centre);
	material.colorNode = color(tokenColor(tokens.holo.cyan));
	const soft = oneMinus(smoothstep(0.2, 0.5, length(uv().sub(0.5))));
	material.opacityNode = vertexStage(life.mul(twinkle)).mul(soft).mul(EXTRAS.moteAlpha);
	material.transparent = true;
	material.depthWrite = false;
	material.blending = AdditiveBlending;
	material.mrtNode = mrt({ bloomIntensity: float(0) });

	const motes = new InstancedMesh(
		new PlaneGeometry(EXTRAS.moteSize, EXTRAS.moteSize),
		material,
		PARTICLE_COUNT,
	);
	// Positions come from the shader, so the CPU bounds are meaningless.
	motes.frustumCulled = false;
	motes.renderOrder = -1;
	return motes;
}

function makeProjector(clock: SceneClock): Group {
	const cyan = color(tokenColor(tokens.holo.cyan));
	const pulse = sin(clock.time.mul((2 * Math.PI) / 2.8))
		.mul(0.2)
		.add(0.8);

	// Beam: open cone from the emitter up behind the card, bright at the base, soft at grazing edges.
	const beamHeight = 1.75;
	const beamMat = new MeshBasicNodeMaterial();
	const along = positionLocal.y.div(beamHeight).add(0.5); // 0 at base → 1 at top
	const facing = pow(abs(dot(normalView, positionViewDirection)), 2);
	beamMat.colorNode = cyan;
	beamMat.opacityNode = pow(oneMinus(along), 1.6).mul(0.32).mul(facing).mul(pulse);
	beamMat.transparent = true;
	beamMat.depthWrite = false;
	beamMat.blending = AdditiveBlending;
	beamMat.side = DoubleSide;
	beamMat.mrtNode = mrt({ bloomIntensity: float(LOOK.emitterBloom) });
	const beam = new Mesh(new CylinderGeometry(0.58, 0.06, beamHeight, 48, 1, true), beamMat);
	beam.position.set(0, -0.95 + beamHeight / 2, -0.06);

	// Emitter: radial glow disc at the base, tipped toward the camera.
	const emitterMat = new MeshBasicNodeMaterial();
	const radial = oneMinus(smoothstep(0, 1, length(uv().sub(0.5)).mul(2)));
	emitterMat.colorNode = cyan;
	emitterMat.opacityNode = radial.mul(0.85).mul(pulse);
	emitterMat.transparent = true;
	emitterMat.depthWrite = false;
	emitterMat.blending = AdditiveBlending;
	emitterMat.mrtNode = mrt({ bloomIntensity: float(LOOK.emitterBloom) });
	const emitter = new Mesh(new CircleGeometry(0.42, 48), emitterMat);
	emitter.rotation.x = -Math.PI / 2 + 0.35;
	emitter.position.set(0, -0.95, 0);

	const group = new Group();
	group.add(beam, emitter);
	return group;
}

export type HoloScene = {
	scene: Scene;
	camera: PerspectiveCamera;
	cards: HoloCard[];
	projector: Group;
	/** Beam particles (hidden under Reduce Motion). */
	motes: InstancedMesh;
	pipeline: RenderPipeline;
	clock: SceneClock;
	dispose: () => void;
};

export function buildHoloScene(
	renderer: WebGPURenderer,
	opts: { cardCount: number; aspect: number },
): HoloScene {
	const scene = new Scene();
	scene.backgroundNode = color(tokenColor(tokens.surface.background));

	const camera = new PerspectiveCamera(CAMERA_FOV_DEG, opts.aspect, 0.1, 100);
	camera.position.set(0, 0, CAMERA_Z);
	camera.lookAt(0, 0, 0);

	const clock: SceneClock = {
		time: makeFloat(0),
		flicker: makeFloat(1),
		band: makeFloat(-1),
		bandStrength: makeFloat(0),
		fringeOn: makeFloat(0), // the first motion frame turns it on
	};
	const projector = makeProjector(clock);
	const motes = makeMotes(clock);
	motes.visible = false;
	projector.add(motes);
	scene.add(projector);
	const cards = Array.from({ length: opts.cardCount }, () => makeCard(clock));
	for (const card of cards) scene.add(card.mesh);

	// Selective bloom: each material writes `bloomIntensity` (MRT); bloom runs on colour × that.
	const pipeline = new RenderPipeline(renderer);
	const scenePass = pass(scene, camera);
	scenePass.setMRT(mrt({ output, bloomIntensity: float(0) }));
	const sceneColor = scenePass.getTextureNode('output');
	const glow = scenePass.getTextureNode('bloomIntensity');
	// Fade the bloom to zero at the canvas edges, or its wide glow stops in a hard rectangle
	// where the canvas meets the (identically coloured) screen around it.
	const edgeFade = smoothstep(0, 0.18, screenUV.x)
		.mul(smoothstep(0, 0.18, oneMinus(screenUV.x)))
		.mul(smoothstep(0, 0.14, screenUV.y))
		.mul(smoothstep(0, 0.14, oneMinus(screenUV.y)));
	const glowPass = bloom(
		sceneColor.mul(glow),
		LOOK.bloomStrength,
		LOOK.bloomRadius,
		LOOK.bloomThreshold,
	);
	pipeline.outputNode = sceneColor.add(glowPass.mul(edgeFade));

	return {
		scene,
		camera,
		cards,
		projector,
		motes,
		pipeline,
		clock,
		dispose: () => {
			pipeline.dispose();
			motes.dispose();
			scene.traverse((obj) => {
				if (obj instanceof Mesh) {
					obj.geometry.dispose();
					(obj.material as MeshBasicNodeMaterial).dispose();
				}
			});
		},
	};
}
