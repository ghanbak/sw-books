import { useEffect, useRef } from 'react';
import { PixelRatio, StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { Canvas, type CanvasRef } from 'react-native-webgpu';

import { requestStageDevice } from '@/lib/holo3d/runtime/gpu';
import {
	type HoloStageController,
	type StageBook,
	createHoloStage,
} from '@/lib/holo3d/runtime/stage';
import { reportHoloUnavailable } from '@/lib/holo3d/status';

export type HoloStageCanvasProps = {
	mode: 'pager' | 'single';
	books: StageBook[];
	width: number;
	height: number;
	cardWidth: number;
	pixelRatioCap: number;
	activePage: number;
	pageWidth?: number;
	scrollX?: SharedValue<number>;
	pressedPage: number | null;
	paused: boolean;
	reduceMotion: boolean;
	/** True once the first frame (with the active cover settled) is on screen; false on unmount. */
	onReadyChange: (ready: boolean) => void;
	onCoverFailed: (index: number) => void;
};

/** Frames to wait for a non-zero layout before giving up on the context. */
const CONTEXT_RETRY_FRAMES = 30;

/**
 * The WebGPU canvas + its stage controller. The only module that imports three.js — loaded
 * lazily (components/holo-stage.tsx) so three never evaluates at app start. Mount-once: layout
 * changes remount it via `key`; everything else is synced into the controller by setters.
 */
export default function HoloStageCanvas(props: HoloStageCanvasProps) {
	const ref = useRef<CanvasRef>(null);
	const controllerRef = useRef<HoloStageController | null>(null);
	// Latest props for the async setup + controller callbacks (written after render, never during).
	const latest = useRef(props);
	useEffect(() => {
		latest.current = props;
	});

	useEffect(() => {
		let alive = true;
		let raf = 0;
		let retries = 0;
		let controller: HoloStageController | null = null;

		const start = async () => {
			const context = ref.current?.getContext('webgpu');
			if (!context) {
				// Zero-size layout on the first frame — retry (react-native-webgpu docs).
				if (++retries > CONTEXT_RETRY_FRAMES) throw new Error('no webgpu context');
				raf = requestAnimationFrame(launch);
				return;
			}
			const device = await requestStageDevice();
			if (!device) return;
			if (!alive) {
				device.destroy();
				return;
			}
			const p = latest.current;
			controller = createHoloStage({
				context,
				device,
				mode: p.mode,
				width: p.width,
				height: p.height,
				pixelRatio: Math.min(PixelRatio.get(), p.pixelRatioCap),
				cardWidth: p.cardWidth,
				pageWidth: p.pageWidth,
				getScrollX: () => latest.current.scrollX?.get() ?? 0,
				onFirstFrame: () => latest.current.onReadyChange(true),
				onCoverFailed: (index) => latest.current.onCoverFailed(index),
				onError: (reason) => reportHoloUnavailable(reason),
			});
			controller.setBooks(p.books);
			controller.setActivePage(p.activePage);
			controller.setReduceMotion(p.reduceMotion);
			controller.setPressed(p.pressedPage);
			if (p.paused) controller.pause();
			controllerRef.current = controller;
		};
		const launch = () => {
			start().catch(() => {
				if (alive) reportHoloUnavailable('init');
			});
		};
		launch();

		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			controller?.dispose();
			controllerRef.current = null;
			// Covers both parking and a `key` remount: callers fall back to HoloFace until the next frame.
			latest.current.onReadyChange(false);
		};
	}, []);

	// Sync on derived primitives, not array identity — a refetch with the same books is a no-op.
	const booksKey = props.books.map((b) => `${b.key}|${b.coverUri ?? ''}`).join(',');
	const appliedBooksKey = useRef<string | null>(null);
	useEffect(() => {
		if (appliedBooksKey.current === booksKey) return;
		appliedBooksKey.current = booksKey;
		controllerRef.current?.setBooks(latest.current.books);
	}, [booksKey]);
	useEffect(() => {
		controllerRef.current?.setActivePage(props.activePage);
	}, [props.activePage]);
	useEffect(() => {
		controllerRef.current?.setPressed(props.pressedPage);
	}, [props.pressedPage]);
	useEffect(() => {
		controllerRef.current?.setReduceMotion(props.reduceMotion);
	}, [props.reduceMotion]);
	useEffect(() => {
		if (props.paused) controllerRef.current?.pause();
		else controllerRef.current?.resume();
	}, [props.paused]);

	return <Canvas ref={ref} style={StyleSheet.absoluteFill} />;
}
