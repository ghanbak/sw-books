import { texture } from 'three/tsl';
import {
	LinearMipmapLinearFilter,
	MeshBasicNodeMaterial,
	QuadMesh,
	RenderTarget,
	SRGBColorSpace,
	Texture,
	type WebGPURenderer,
} from 'three/webgpu';

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
