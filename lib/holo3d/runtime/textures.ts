import { texture } from 'three/tsl';
import {
	DataTexture,
	LinearFilter,
	LinearMipmapLinearFilter,
	MeshBasicNodeMaterial,
	QuadMesh,
	RenderTarget,
	SRGBColorSpace,
	Texture,
	type WebGPURenderer,
} from 'three/webgpu';

import { starfield } from '@/lib/starfield';

/**
 * Cover textures for the 3D stage.
 *
 * - **Shared:** encoded cover bytes only (a few hundred KB each), keyed by URI, deduped and
 *   LRU-capped. Detail opened from the Timeline skips the network fetch.
 * - **Per stage:** decoded GPU textures, owned by the stage that uploaded them and disposed when
 *   they leave its window — no texture is shared across renderers, so nothing to refcount.
 * - **Downscale on the GPU:** react-native-webgpu 0.15.1 ignores `createImageBitmap` resize
 *   options, so the full-size bitmap is drawn once into a ≤ 640×960 mipmapped render target and
 *   the full-size texture is dropped (≈3.3 MB per cover instead of up to 11.5 MB).
 */

const BYTES_CACHE_LIMIT = 16;
const bytesCache = new Map<string, Promise<ArrayBuffer>>();

export function fetchCoverBytes(uri: string): Promise<ArrayBuffer> {
	const hit = bytesCache.get(uri);
	if (hit) {
		// Re-insert to mark most-recently-used (Map preserves insertion order).
		bytesCache.delete(uri);
		bytesCache.set(uri, hit);
		return hit;
	}
	const pending = fetch(uri).then((response) => {
		if (!response.ok) throw new Error(`cover ${response.status}`);
		return response.arrayBuffer();
	});
	// Failed fetches aren't cached, so the next window visit retries.
	pending.catch(() => bytesCache.delete(uri));
	bytesCache.set(uri, pending);
	while (bytesCache.size > BYTES_CACHE_LIMIT) {
		const oldest = bytesCache.keys().next().value;
		if (oldest === undefined) break;
		bytesCache.delete(oldest);
	}
	return pending;
}

/** Fetch (cached) + native decode. The caller uploads it later, off the scroll path. */
export async function decodeCover(uri: string): Promise<ImageBitmap> {
	const bytes = await fetchCoverBytes(uri);
	return createImageBitmap(bytes);
}

export type CoverTexture = { texture: Texture; dispose: () => void };

const MAX_W = 640;
const MAX_H = 960;

/**
 * Upload a decoded cover and downscale it on the GPU. Closes the bitmap. Synchronous GPU work —
 * call from the frame loop when the pager is idle, one cover per frame.
 */
export function uploadCover(renderer: WebGPURenderer, bitmap: ImageBitmap): CoverTexture {
	const full = new Texture(bitmap);
	full.colorSpace = SRGBColorSpace;
	// copyExternalImageToTexture lands the bitmap upside down without this (Phase 0 G1).
	full.flipY = true;
	full.needsUpdate = true;

	const scale = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height);
	const target = new RenderTarget(
		Math.max(1, Math.round(bitmap.width * scale)),
		Math.max(1, Math.round(bitmap.height * scale)),
		{ depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter },
	);
	const blit = new MeshBasicNodeMaterial();
	blit.colorNode = texture(full);
	const quad = new QuadMesh(blit);
	const previous = renderer.getRenderTarget();
	renderer.setRenderTarget(target);
	quad.render(renderer);
	renderer.setRenderTarget(previous);

	blit.dispose();
	full.dispose();
	bitmap.close();
	target.texture.anisotropy = 2;
	return { texture: target.texture, dispose: () => target.dispose() };
}

const SKY_W = 320;
const SKY_H = 480;

/**
 * The no-cover face for the 3D card: the same deterministic stars as the 2D face
 * (lib/starfield.ts), rasterized on the CPU (≈50 soft discs on black — well under a ms).
 * `coverWidth` is the on-screen card width, so star counts match the HoloFace it replaces.
 */
export function makeStarfieldTexture(seed: string, coverWidth: number): CoverTexture {
	const data = new Uint8Array(SKY_W * SKY_H * 4);
	for (let i = 3; i < data.length; i += 4) data[i] = 255;
	for (const star of starfield(seed, coverWidth)) {
		const cx = star.x * SKY_W;
		// DataTexture rows run bottom-up in UV space; the card samples top-down like the 2D face.
		const cy = (1 - star.y) * SKY_H;
		// A touch larger than the 2D dot: the hologram tint + 92% opacity dims small stars.
		const radius = Math.max(1, star.r * SKY_W * 1.5);
		const x0 = Math.max(0, Math.floor(cx - radius - 1));
		const x1 = Math.min(SKY_W - 1, Math.ceil(cx + radius + 1));
		const y0 = Math.max(0, Math.floor(cy - radius - 1));
		const y1 = Math.min(SKY_H - 1, Math.ceil(cy + radius + 1));
		for (let y = y0; y <= y1; y++) {
			for (let x = x0; x <= x1; x++) {
				const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
				const coverage = Math.min(1, Math.max(0, radius + 0.5 - d));
				if (coverage <= 0) continue;
				const v = Math.round(255 * coverage * star.a);
				const o = (y * SKY_W + x) * 4;
				if (v > data[o]) {
					data[o] = v;
					data[o + 1] = v;
					data[o + 2] = v;
				}
			}
		}
	}
	const sky = new DataTexture(data, SKY_W, SKY_H);
	sky.colorSpace = SRGBColorSpace;
	sky.magFilter = LinearFilter;
	sky.minFilter = LinearFilter;
	sky.needsUpdate = true;
	return { texture: sky, dispose: () => sky.dispose() };
}
