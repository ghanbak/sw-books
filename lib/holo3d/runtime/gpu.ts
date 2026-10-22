// Hermes has TextEncoder but no TextDecoder, which three uses — polyfill before three loads.
import 'fast-text-encoding';
// Side-effect import installs navigator.gpu, createImageBitmap and the WebGPU globals.
import 'react-native-webgpu';
import type { RNCanvasContext } from 'react-native-webgpu';
import { MeshBasicNodeMaterial, QuadMesh, WebGPURenderer } from 'three/webgpu';

import { reportHoloUnavailable } from '../status';

/**
 * A GPU device owned by ONE stage, destroyed with it. Not shared: three's WebGPUBackend
 * registers `device.lost.then(...)` capturing its renderer, so a long-lived shared device
 * keeps every renderer ever created alive (Phase 0 G4: linear leak). Destroying the device
 * settles that promise (reason 'destroyed', which three ignores) and frees the renderer.
 */
export async function requestStageDevice(): Promise<GPUDevice | null> {
	if (!('gpu' in navigator)) {
		reportHoloUnavailable('no-webgpu');
		return null;
	}
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		reportHoloUnavailable('no-webgpu');
		return null;
	}
	const device = await adapter.requestDevice();
	void device.lost.then((info) => {
		if (info.reason !== 'destroyed') reportHoloUnavailable('device-lost');
	});
	device.onuncapturederror = (event) => {
		console.warn(`[holo3d] uncaptured GPU error: ${event.error.message}`);
	};
	return device;
}

let liveRenderers = 0;

export function createHoloRenderer(context: RNCanvasContext, device: GPUDevice): WebGPURenderer {
	liveRenderers += 1;
	return new WebGPURenderer({ canvas: context.canvas, context, device, antialias: false });
}

type WithListeners = { _listeners?: Record<string, unknown> };

/** three r184+ leak workaround (react-native-webgpu#445). Delete when fixed upstream. */
function clearQuadMeshListeners(): void {
	// Every QuadMesh shares one module-level geometry; that's where the stale listeners live.
	const material = new MeshBasicNodeMaterial();
	const { geometry } = new QuadMesh(material);
	for (const target of [geometry, geometry.index, ...Object.values(geometry.attributes)]) {
		if (target) (target as WithListeners)._listeners = {};
	}
	material.dispose();
}

/** Stops three's internal loop and frees the renderer; call before destroying its device. */
export function disposeHoloRenderer(renderer: WebGPURenderer): void {
	void renderer.setAnimationLoop(null);
	renderer.dispose();
	liveRenderers -= 1;
	// Only safe with no other live renderer — clearing would strip a live one's listeners.
	if (liveRenderers === 0) clearQuadMeshListeners();
}
