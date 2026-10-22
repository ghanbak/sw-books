// Phase 0 spike (throwaway): one WebGPU canvas rendering the hologram scene.
// Props are read once at mount; the screen remounts (key) to change options.
import { useEffect, useRef } from 'react';
import { PixelRatio, type StyleProp, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { Canvas, type CanvasRef } from 'react-native-webgpu';
import type { RenderTarget, Texture, WebGPURenderer } from 'three/webgpu';

import {
	createSpikeRenderer,
	disposeSpikeRenderer,
	getSpikeDevice,
	requestFreshDevice,
} from './gpu';
import {
	type BloomMode,
	type HoloScene,
	type Tuning,
	bitmapTexture,
	buildHoloScene,
	downscaleCover,
	fetchCoverBitmap,
} from './scene';

export type SpikeTimings = {
	device: number;
	init: number;
	compile: number;
	coverFetch: number;
	coverDecode: number;
	coverUpload: number;
	firstSubmit: number;
	total: number;
	cover?: string;
};

export type FrameStats = { p50: number; p95: number; max: number; frames: number; fps: number };

type Props = {
	mode: 'card' | 'pager';
	coverUri: string | null;
	pageCount?: number;
	pageWidth?: number;
	scrollX?: SharedValue<number>;
	bloom: BloomMode;
	/** Own device per stage, destroyed on unmount (G4 leak fix) vs the shared singleton. */
	freshDevice?: boolean;
	/** Live look parameters, read every frame (sliders mutate `.current`). */
	tuning?: { current: Tuning };
	downscale: boolean;
	flipY: boolean;
	pixelRatioCap: number;
	cardPoints: { w: number; h: number };
	onTimings?: (t: SpikeTimings) => void;
	onFrameStats?: (s: FrameStats) => void;
	onError?: (message: string) => void;
	style?: StyleProp<ViewStyle>;
};

/** Card-mode vertical lift, in card widths (centres the rig's ≈ 1.95-card-width span). */
const RIG_LIFT = 0.22;

const FALLBACK_COLORS = ['#1a3a5c', '#5c3a1a', '#2d4a22', '#4a2545', '#1a4a4a'];

function percentile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export function SpikeStage(props: Props) {
	const ref = useRef<CanvasRef>(null);
	// Mount-once: snapshot props so the async setup never reads changing values.
	const propsRef = useRef(props);

	useEffect(() => {
		const p = propsRef.current;
		let alive = true;
		let raf = 0;
		let renderer: WebGPURenderer | null = null;
		let ownedDevice: GPUDevice | null = null;
		let holo: HoloScene | null = null;
		let cover: Texture | null = null;
		let coverTarget: RenderTarget | null = null;
		let statsTimer: ReturnType<typeof setInterval> | null = null;
		const frameTimes: number[] = [];
		let framesSinceStats = 0;

		const fail = (error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`[holo-spike] ${message}`);
			p.onError?.(message);
		};

		const start = async () => {
			const canvasRef = ref.current;
			const surface = canvasRef?.getNativeSurface();
			const context = canvasRef?.getContext('webgpu');
			if (!canvasRef || !surface || !context || surface.clientWidth === 0) {
				raf = requestAnimationFrame(() => void start().catch(fail));
				return;
			}
			const ratio = Math.min(PixelRatio.get(), p.pixelRatioCap);
			context.canvas.width = Math.round(surface.clientWidth * ratio);
			context.canvas.height = Math.round(surface.clientHeight * ratio);

			const t0 = performance.now();
			const device = p.freshDevice ? await requestFreshDevice() : await getSpikeDevice();
			if (p.freshDevice) ownedDevice = device;
			if (!alive) {
				ownedDevice?.destroy();
				return;
			}
			if (!device) throw new Error('WebGPU unavailable');
			const tDevice = performance.now();

			renderer = createSpikeRenderer(context, device);
			await renderer.init();
			if (!alive) return;
			const tInit = performance.now();

			holo = buildHoloScene(renderer, {
				cardCount: p.mode === 'pager' ? (p.pageCount ?? 5) : 1,
				layoutHeight: surface.clientHeight,
				aspect: surface.clientWidth / surface.clientHeight,
				bloom: p.bloom,
			});
			const scale = p.cardPoints.w * holo.worldPerPoint;
			holo.projector.scale.setScalar(scale);
			if (p.mode === 'card') holo.projector.position.y = RIG_LIFT * scale;
			holo.cards.forEach((card, i) => {
				card.mesh.scale.setScalar(scale);
				card.setFallbackColor(FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
				// Card mode: lift the whole rig so card + beam + emitter are centred in the canvas
				// (the rig spans ≈ +0.75 → −1.2 card widths). Pager keeps the card centred so it
				// lines up with the RN overlays.
				if (p.mode === 'card') card.mesh.position.y = RIG_LIFT * scale;
			});
			await renderer.compileAsync(holo.scene, holo.camera);
			if (!alive) return;
			const tCompile = performance.now();

			let coverFetch = 0;
			let coverDecode = 0;
			let coverUpload = 0;
			if (p.mode === 'card' && p.coverUri) {
				const loaded = await fetchCoverBitmap(p.coverUri);
				if (!alive) {
					loaded.bitmap.close();
					return;
				}
				coverFetch = loaded.fetchMs;
				coverDecode = loaded.decodeMs;
				const u0 = performance.now();
				const full = bitmapTexture(loaded.bitmap, p.flipY);
				renderer.initTexture(full);
				if (p.downscale) {
					const small = downscaleCover(renderer, full);
					cover = small.texture;
					coverTarget = small.target;
					console.log(
						`[holo-spike] cover ${loaded.bitmap.width}×${loaded.bitmap.height} → ${small.width}×${small.height}`,
					);
				} else {
					cover = full;
				}
				loaded.bitmap.close();
				coverUpload = performance.now() - u0;
				holo.cards[0].setCover(cover);
			}

			let firstFrame = true;
			const tLoopStart = performance.now();
			const frame = () => {
				if (!holo || !renderer) return;
				const f0 = performance.now();
				if (p.mode === 'pager' && p.scrollX && p.pageWidth) {
					const sx = p.scrollX.get();
					holo.cards.forEach((card, i) => {
						const offsetPts = i * (p.pageWidth ?? 0) - sx;
						card.mesh.position.x = offsetPts * (holo?.worldPerPoint ?? 0);
						card.mesh.visible = Math.abs(offsetPts) < (p.pageWidth ?? 0) * 1.2;
					});
				}
				if (p.tuning) holo.applyTuning(p.tuning.current);
				holo.pipeline.render();
				context.present();
				const dt = performance.now() - f0;
				frameTimes.push(dt);
				if (frameTimes.length > 600) frameTimes.shift();
				framesSinceStats += 1;
				if (firstFrame) {
					firstFrame = false;
					void device.queue.onSubmittedWorkDone().then(() => {
						const tFirst = performance.now();
						const timings: SpikeTimings = {
							device: tDevice - t0,
							init: tInit - tDevice,
							compile: tCompile - tInit,
							coverFetch,
							coverDecode,
							coverUpload,
							firstSubmit: tFirst - tLoopStart,
							total: tFirst - t0 - coverFetch,
							cover: p.coverUri ?? undefined,
						};
						console.log(`[holo-spike] timings ${JSON.stringify(timings)}`);
						if (alive) p.onTimings?.(timings);
					});
				}
			};
			void renderer.setAnimationLoop(frame);

			let lastStats = performance.now();
			statsTimer = setInterval(() => {
				const now = performance.now();
				const sorted = [...frameTimes].sort((a, b) => a - b);
				const stats: FrameStats = {
					p50: percentile(sorted, 0.5),
					p95: percentile(sorted, 0.95),
					max: sorted[sorted.length - 1] ?? 0,
					frames: sorted.length,
					fps: (framesSinceStats * 1000) / (now - lastStats),
				};
				framesSinceStats = 0;
				lastStats = now;
				p.onFrameStats?.(stats);
			}, 1000);
		};

		void start().catch(fail);

		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			if (statsTimer) clearInterval(statsTimer);
			holo?.dispose();
			cover?.dispose();
			coverTarget?.dispose();
			if (renderer) disposeSpikeRenderer(renderer);
			// Destroying settles device.lost, releasing three's renderer-capturing callback.
			ownedDevice?.destroy();
		};
	}, []);

	return <Canvas ref={ref} style={props.style} />;
}
