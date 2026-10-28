import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
	abs,
	color,
	dot,
	float,
	fract,
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
} from 'three/tsl';
import {
	AdditiveBlending,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DataTexture,
	DoubleSide,
	Group,
	Mesh,
	MeshBasicNodeMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	RenderPipeline,
	Scene,
	type Texture,
	type WebGPURenderer,
} from 'three/webgpu';

import { tokens } from '@/constants/tokens';

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

/** sRGB token → linear THREE.Color. Alpha is dropped up front (THREE ignores it, with a warning). */
const tokenColor = (value: string) =>
	new Color(value.replace(/^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/, 'rgb($1,$2,$3)'));

/** Frame-driven clock + flicker, set from the CPU so Reduce Motion can freeze them. */
export type SceneClock = {
	time: ReturnType<typeof makeFloat>;
	flicker: ReturnType<typeof makeFloat>;
};
const makeFloat = (v: number) => uniform(v);

export type HoloCard = {
	mesh: Mesh;
	/** `sky` = the no-cover starfield: keeps its black (no projection floor) so stars read. */
	setCover: (cover: Texture | null, kind?: 'cover' | 'sky') => void;
	setFallbackColor: (hex: string) => void;
	setFade: (opacity: number) => void;
	setPressed: (pressed: boolean) => void;
};

function makeCard(clock: SceneClock): HoloCard {
	const placeholder = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
	placeholder.needsUpdate = true;
	const coverNode = texture(placeholder);
	const hasCover = uniform(0);
	// Projection brightness floor: lifts a cover's blacks into the hologram blue. The starfield
	// keeps its black sky.
	const floor = uniform(0.3);
	const isSky = uniform(0);
	const fallback = uniform(new Color(tokens.badge.canon));
	const fade = uniform(1);
	const pressed = uniform(0);

	// Rounded-rect SDF in card space → alpha mask + inner edge glow.
	const p = uv().sub(0.5).mul(vec2(1, CARD_ASPECT));
	const half = vec2(0.5 - CORNER, CARD_ASPECT / 2 - CORNER);
	const q = abs(p).sub(half);
	const dist = length(max(q, 0)).sub(CORNER);
	const mask = oneMinus(smoothstep(-0.004, 0.004, dist));
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

	const scan = step(0.5, fract(uv().y.mul(SCANLINES).sub(clock.time.mul(0.12))));
	const cyan = color(tokenColor(tokens.holo.cyan));

	const material = new MeshBasicNodeMaterial();
	material.colorNode = base
		.mul(scan.mul(0.18).add(0.9))
		.add(cyan.mul(edgeGlow).mul(LOOK.edgeLight))
		.mul(clock.flicker)
		.mul(pressed.mul(0.25).add(1));
	material.opacityNode = mask.mul(0.92).mul(fade);
	material.transparent = true;
	material.depthWrite = false;
	material.mrtNode = mrt({
		bloomIntensity: edgeGlow.mul(LOOK.edgeBloom).add(LOOK.faceHalo).mul(mask).mul(fade),
	});

	const mesh = new Mesh(new PlaneGeometry(1, CARD_ASPECT), material);
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
	};
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

	const clock: SceneClock = { time: makeFloat(0), flicker: makeFloat(1) };
	const projector = makeProjector(clock);
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
		pipeline,
		clock,
		dispose: () => {
			pipeline.dispose();
			scene.traverse((obj) => {
				if (obj instanceof Mesh) {
					obj.geometry.dispose();
					(obj.material as MeshBasicNodeMaterial).dispose();
				}
			});
		},
	};
}
