// Phase 0 spike (throwaway): device + renderer lifecycle for the WebGPU hologram.
// Hermes has TextEncoder but no TextDecoder, which three uses — polyfill before three loads.
import 'fast-text-encoding';
// Side-effect import installs navigator.gpu, createImageBitmap and the WebGPU globals.
import 'react-native-webgpu';
import type { RNCanvasContext } from 'react-native-webgpu';
import { MeshBasicNodeMaterial, QuadMesh, WebGPURenderer } from 'three/webgpu';

let devicePromise: Promise<GPUDevice | null> | null = null;

/** One device for the whole app, requested lazily (resolves null when WebGPU is unavailable). */
export function getSpikeDevice(): Promise<GPUDevice | null> {
	if (!devicePromise) {
		devicePromise = (async () => {
			if (!('gpu' in navigator)) return null;
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) return null;
			const device = await adapter.requestDevice();
			void device.lost.then((info) => {
				console.warn(`[holo-spike] device lost: ${info.reason} ${info.message}`);
				devicePromise = null;
			});
			return device;
		})();
	}
	return devicePromise;
}

let liveRenderers = 0;

export function getLiveRendererCount(): number {
	return liveRenderers;
}

export function createSpikeRenderer(context: RNCanvasContext, device: GPUDevice): WebGPURenderer {
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

export function disposeSpikeRenderer(renderer: WebGPURenderer): void {
	void renderer.setAnimationLoop(null);
	renderer.dispose();
	liveRenderers -= 1;
	// Only safe with no other live renderer — clearing would strip a live one's listeners.
	if (liveRenderers === 0) clearQuadMeshListeners();
}

declare const HermesInternal: { getInstrumentedStats?: () => Record<string, number> } | undefined;

/** Native-backed (external) bytes held by the JS heap — GPU wrappers report here. */
export function externalMB(): number {
	const stats =
		typeof HermesInternal !== 'undefined' ? HermesInternal?.getInstrumentedStats?.() : undefined;
	return (stats?.js_externalBytes ?? 0) / (1024 * 1024);
}
