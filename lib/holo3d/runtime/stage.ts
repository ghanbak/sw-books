import type { RNCanvasContext } from 'react-native-webgpu';
import type { WebGPURenderer } from 'three/webgpu';

import { RIG_LIFT, cardTransform, pageAt, windowIndices, worldPerPoint } from '../pager';
import { createHoloRenderer, disposeHoloRenderer } from './gpu';
import { type HoloScene, buildHoloScene } from './scene';
import { type CoverTexture, decodeCover, uploadCover } from './textures';

/**
 * Imperative controller for one hologram canvas — the only owner of three objects. React syncs
 * props in through setters; the frame loop reads controller state only, so it can never close
 * over stale props (React Compiler-safe).
 *
 * Owns its GPU device and destroys it on dispose (see gpu.ts: a shared device leaks renderers).
 */

export type StageBook = { key: string; coverUri: string | null; fallbackColor: string };

export type StageOptions = {
	context: RNCanvasContext;
	device: GPUDevice;
	/** `pager` = Timeline (3-card pool following the scroll); `single` = detail hero. */
	mode: 'pager' | 'single';
	/** Canvas layout size (points), drawing-buffer pixel ratio, on-screen card width (points). */
	width: number;
	height: number;
	pixelRatio: number;
	cardWidth: number;
	/** Pager page width (points) and live horizontal offset. */
	pageWidth?: number;
	getScrollX?: () => number;
	onFirstFrame?: () => void;
	onError?: (reason: 'init' | 'frame') => void;
};

export type HoloStageController = {
	setBooks: (books: StageBook[]) => void;
	/** Settled page — drives which covers are resident (± 1). */
	setActivePage: (page: number) => void;
	setPressed: (page: number | null) => void;
	setReduceMotion: (on: boolean) => void;
	pause: () => void;
	resume: () => void;
	dispose: () => void;
};

/** A scroll offset change within this window counts as "scrolling" — no uploads then. */
const SCROLL_SETTLE_MS = 150;

export function createHoloStage(opts: StageOptions): HoloStageController {
	const { context, device, mode } = opts;
	const pageWidth = opts.pageWidth ?? opts.width;

	let disposed = false;
	let paused = false;
	let reduceMotion = false;
	let dirty = true;
	let books: StageBook[] = [];
	let generation = 0; // bumps on setBooks so stale decodes are dropped
	let activePage = 0;
	let pressedPage: number | null = null;

	const textures = new Map<number, CoverTexture>();
	const loading = new Set<number>();
	const failed = new Set<number>();
	const ready: { index: number; generation: number; bitmap: ImageBitmap }[] = [];

	let renderer: WebGPURenderer | null = null;
	let holo: HoloScene | null = null;
	let scale = 0;
	let wpp = 0;
	let lastScrollX = Number.NaN;
	let lastScrollChange = 0;
	let firstFrame = true;

	const inWindow = (index: number) =>
		mode === 'single' ? index === 0 : Math.abs(index - activePage) <= 1;

	const refreshWindow = () => {
		const wanted =
			mode === 'single' ? (books.length ? [0] : []) : windowIndices(activePage, books.length);
		for (const [index, cover] of textures) {
			if (!wanted.includes(index)) {
				cover.dispose();
				textures.delete(index);
			}
		}
		const gen = generation;
		for (const index of wanted) {
			const uri = books[index]?.coverUri;
			if (!uri || textures.has(index) || loading.has(index) || failed.has(index)) continue;
			loading.add(index);
			decodeCover(uri)
				.then((bitmap) => {
					loading.delete(index);
					if (disposed || gen !== generation || !inWindow(index)) {
						bitmap.close();
						return;
					}
					ready.push({ index, generation: gen, bitmap });
				})
				.catch(() => {
					loading.delete(index);
					// 404 / decode failure → the card keeps its tinted fallback (and RN title overlay).
					if (gen === generation) failed.add(index);
				});
		}
		dirty = true;
	};

	const dropReady = () => {
		for (const item of ready.splice(0)) item.bitmap.close();
	};

	/** At most one upload per frame, and never while the pager is moving (avoids mid-swipe stalls). */
	const uploadOne = (now: number) => {
		if (!renderer || ready.length === 0) return false;
		if (mode === 'pager' && now - lastScrollChange < SCROLL_SETTLE_MS) return false;
		const item = ready.shift();
		if (!item) return false;
		if (item.generation !== generation || !inWindow(item.index) || textures.has(item.index)) {
			item.bitmap.close();
			return false;
		}
		textures.set(item.index, uploadCover(renderer, item.bitmap));
		return true;
	};

	const layoutCards = (scene: HoloScene, now: number) => {
		if (mode === 'single') {
			const card = scene.cards[0];
			card.mesh.visible = books.length > 0;
			card.setCover(textures.get(0)?.texture ?? null);
			if (books[0]) card.setFallbackColor(books[0].fallbackColor);
			return;
		}
		const scrollX = opts.getScrollX?.() ?? 0;
		if (scrollX !== lastScrollX) {
			lastScrollX = scrollX;
			lastScrollChange = now;
			dirty = true;
		}
		const live = pageAt(scrollX, pageWidth, books.length);
		scene.cards.forEach((card, slot) => {
			const index = live - 1 + slot;
			const book = books[index];
			if (!book) {
				card.mesh.visible = false;
				return;
			}
			const t = cardTransform(index, scrollX, pageWidth);
			card.mesh.visible = t.visible;
			card.mesh.position.x = t.offset * wpp;
			card.mesh.rotation.y = t.rotationY;
			card.setFade(t.opacity);
			card.setCover(textures.get(index)?.texture ?? null);
			card.setFallbackColor(book.fallbackColor);
			card.setPressed(pressedPage === index);
		});
	};

	const frame = (time: number) => {
		if (disposed || paused || !holo || !renderer) return;
		try {
			const now = performance.now();
			if (!reduceMotion) {
				const t = time / 1000;
				holo.clock.time.value = t;
				holo.clock.flicker.value = 0.95 + Math.sin(t * 23) * Math.sin(t * 7.3) * 0.04;
				dirty = true;
			}
			layoutCards(holo, now);
			if (uploadOne(now)) dirty = true;
			// Reduce Motion: a still image — only redraw when something actually changed.
			if (!dirty && !firstFrame) return;
			dirty = false;
			holo.pipeline.render();
			context.present();
			if (firstFrame) {
				firstFrame = false;
				void device.queue.onSubmittedWorkDone().then(() => {
					if (!disposed) opts.onFirstFrame?.();
				});
			}
		} catch (error) {
			console.warn(`[holo3d] frame failed: ${error instanceof Error ? error.message : error}`);
			void renderer.setAnimationLoop(null);
			opts.onError?.('frame');
		}
	};

	const start = async () => {
		context.canvas.width = Math.max(1, Math.round(opts.width * opts.pixelRatio));
		context.canvas.height = Math.max(1, Math.round(opts.height * opts.pixelRatio));
		renderer = createHoloRenderer(context, device);
		await renderer.init();
		if (disposed) return;
		holo = buildHoloScene(renderer, {
			cardCount: mode === 'pager' ? 3 : 1,
			aspect: opts.width / opts.height,
		});
		wpp = worldPerPoint(opts.height);
		scale = opts.cardWidth * wpp;
		const lift = mode === 'single' ? RIG_LIFT * scale : 0;
		holo.projector.scale.setScalar(scale);
		holo.projector.position.y = lift;
		for (const card of holo.cards) {
			card.mesh.scale.setScalar(scale);
			card.mesh.position.y = lift;
		}
		// Compile every material before the first frame so it doesn't hitch.
		await renderer.compileAsync(holo.scene, holo.camera);
		if (disposed) return;
		void renderer.setAnimationLoop(frame);
	};

	void start().catch((error) => {
		console.warn(`[holo3d] init failed: ${error instanceof Error ? error.message : error}`);
		if (!disposed) opts.onError?.('init');
	});

	return {
		setBooks: (next) => {
			generation += 1;
			books = next;
			for (const cover of textures.values()) cover.dispose();
			textures.clear();
			loading.clear();
			failed.clear();
			dropReady();
			activePage = Math.min(activePage, Math.max(0, books.length - 1));
			refreshWindow();
		},
		setActivePage: (page) => {
			if (page === activePage) return;
			activePage = page;
			refreshWindow();
		},
		setPressed: (page) => {
			pressedPage = page;
			dirty = true;
		},
		setReduceMotion: (on) => {
			reduceMotion = on;
			if (on && holo) {
				holo.clock.time.value = 0;
				holo.clock.flicker.value = 1;
			}
			dirty = true;
		},
		pause: () => {
			paused = true;
		},
		resume: () => {
			paused = false;
			dirty = true;
		},
		dispose: () => {
			if (disposed) return;
			disposed = true;
			dropReady();
			for (const cover of textures.values()) cover.dispose();
			textures.clear();
			holo?.dispose();
			holo = null;
			if (renderer) disposeHoloRenderer(renderer);
			renderer = null;
			// Settles device.lost, releasing three's renderer-capturing callback.
			device.destroy();
		},
	};
}
