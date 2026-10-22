// Phase 0 spike (throwaway): hologram scene — card(s), projector beam + emitter, bloom.
// Unscaled card is 1 × 1.5 world units; the stage scales everything to the on-screen card size.
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
	mix,
	normalView,
	oneMinus,
	pass,
	positionLocal,
	positionViewDirection,
	pow,
	sin,
	smoothstep,
	step,
	texture,
	time,
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
	LinearMipmapLinearFilter,
	Mesh,
	MeshBasicNodeMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	QuadMesh,
	RenderPipeline,
	RenderTarget,
	SRGBColorSpace,
	Scene,
	Texture,
	type WebGPURenderer,
} from 'three/webgpu';

import { tokens } from '@/constants/tokens';

export const CARD_ASPECT = 1.5;
export const CAMERA_Z = 5;
export const CAMERA_FOV = 30;
const SCANLINES = 25; // ≈ the 2D hero's 12pt pitch on a 300pt card
const CORNER = 0.04; // ≈ 8pt on a 200pt card

/** sRGB token → linear THREE.Color (THREE parses rgba() RGB and ignores alpha). */
const tokenColor = (value: string) => new Color(value);

export type HoloCard = {
	mesh: Mesh;
	setCover: (cover: Texture | null) => void;
	setFallbackColor: (hex: string) => void;
};

function makeCard(): HoloCard {
	const placeholder = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
	placeholder.needsUpdate = true;
	const coverNode = texture(placeholder);
	const hasCover = uniform(0);
	const fallback = uniform(new Color('#1a3a5c'));

	// Rounded-rect SDF in card space → alpha mask + inner edge glow.
	const p = uv().sub(0.5).mul(vec2(1, CARD_ASPECT));
	const half = vec2(0.5 - CORNER, CARD_ASPECT / 2 - CORNER);
	const dist = length(max(abs(p).sub(half), 0)).sub(CORNER);
	const mask = oneMinus(smoothstep(-0.004, 0.004, dist));
	const edgeGlow = oneMinus(smoothstep(0, 0.07, dist.negate()));

	// Luminosity-style projection: keep the cover's brightness, take the hologram's hue.
	const lum = luminance(coverNode.rgb);
	const tinted = mix(
		color(tokenColor(tokens.holo.tintBottom)),
		color(tokenColor(tokens.holo.tintTop)),
		lum,
	).mul(lum.mul(0.9).add(0.3));
	const base = mix(fallback.mul(0.8), tinted, hasCover);

	const scan = step(0.5, fract(uv().y.mul(SCANLINES).sub(time.mul(0.12))));
	const flicker = float(0.95).add(
		sin(time.mul(23))
			.mul(sin(time.mul(7.3)))
			.mul(0.04),
	);
	const cyan = color(tokenColor(tokens.holo.cyan));

	const material = new MeshBasicNodeMaterial();
	material.colorNode = base
		.mul(scan.mul(0.18).add(0.9))
		.add(cyan.mul(edgeGlow).mul(0.55))
		.mul(flicker);
	material.opacityNode = mask.mul(0.92);
	material.transparent = true;
	material.depthWrite = false;

	const mesh = new Mesh(new PlaneGeometry(1, CARD_ASPECT), material);
	return {
		mesh,
		setCover: (cover) => {
			coverNode.value = cover ?? placeholder;
			hasCover.value = cover ? 1 : 0;
		},
		setFallbackColor: (hex) => {
			fallback.value.set(hex);
		},
	};
}

function makeProjector(): Group {
	const cyan = color(tokenColor(tokens.holo.cyan));
	const pulse = sin(time.mul((2 * Math.PI) / 2.8))
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
	/** World units per layout point at the card plane (z = 0). */
	worldPerPoint: number;
	dispose: () => void;
};

export function buildHoloScene(
	renderer: WebGPURenderer,
	opts: { cardCount: number; layoutHeight: number; aspect: number; bloom: boolean },
): HoloScene {
	const scene = new Scene();
	scene.backgroundNode = color(tokenColor(tokens.surface.background));

	const camera = new PerspectiveCamera(CAMERA_FOV, opts.aspect, 0.1, 100);
	camera.position.set(0, 0, CAMERA_Z);
	camera.lookAt(0, 0, 0);

	const projector = makeProjector();
	scene.add(projector);
	const cards = Array.from({ length: opts.cardCount }, () => makeCard());
	for (const card of cards) scene.add(card.mesh);

	const pipeline = new RenderPipeline(renderer);
	const scenePass = pass(scene, camera);
	const sceneColor = scenePass.getTextureNode('output');
	pipeline.outputNode = opts.bloom
		? sceneColor.add(bloom(sceneColor, 0.85, 0.45, 0.12))
		: sceneColor;

	const visibleHeight = 2 * CAMERA_Z * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
	return {
		scene,
		camera,
		cards,
		projector,
		pipeline,
		worldPerPoint: visibleHeight / opts.layoutHeight,
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

/** Fetch encoded cover bytes → native ImageBitmap (react-native-webgpu's createImageBitmap). */
export async function fetchCoverBitmap(uri: string) {
	const t0 = performance.now();
	const response = await fetch(uri);
	if (!response.ok) throw new Error(`cover ${response.status}`);
	const bytes = await response.arrayBuffer();
	const t1 = performance.now();
	const bitmap = await createImageBitmap(bytes);
	const t2 = performance.now();
	return { bitmap, fetchMs: t1 - t0, decodeMs: t2 - t1, bytes: bytes.byteLength };
}

export function bitmapTexture(bitmap: ImageBitmap, flipY: boolean): Texture {
	const tex = new Texture(bitmap);
	tex.colorSpace = SRGBColorSpace;
	tex.flipY = flipY;
	tex.generateMipmaps = true;
	tex.minFilter = LinearMipmapLinearFilter;
	tex.anisotropy = 2;
	tex.needsUpdate = true;
	return tex;
}

/**
 * GPU downscale (createImageBitmap's resize options aren't implemented natively in
 * react-native-webgpu 0.15.1): draw the full-size cover once into a ≤ maxW × maxH render
 * target with mips, then drop the full-size texture. Returns the small texture.
 */
export function downscaleCover(
	renderer: WebGPURenderer,
	source: Texture,
	maxW = 640,
	maxH = 960,
): { texture: Texture; target: RenderTarget; width: number; height: number } {
	const image = source.image as { width: number; height: number };
	const scale = Math.min(1, maxW / image.width, maxH / image.height);
	const width = Math.max(1, Math.round(image.width * scale));
	const height = Math.max(1, Math.round(image.height * scale));
	const target = new RenderTarget(width, height, {
		depthBuffer: false,
		generateMipmaps: true,
		minFilter: LinearMipmapLinearFilter,
	});
	const blitMaterial = new MeshBasicNodeMaterial();
	blitMaterial.colorNode = texture(source);
	const quad = new QuadMesh(blitMaterial);
	const previous = renderer.getRenderTarget();
	renderer.setRenderTarget(target);
	quad.render(renderer);
	renderer.setRenderTarget(previous);
	blitMaterial.dispose();
	source.dispose();
	return { texture: target.texture, target, width, height };
}
