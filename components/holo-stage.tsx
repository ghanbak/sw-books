import { useFocusEffect } from 'expo-router';
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AppState, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { useReduceMotion } from '@/hooks/useAccessibility';
import type { StageBook } from '@/lib/holo3d/runtime/stage';
import { useHoloStatus } from '@/lib/holo3d/status';

// three.js + react-native-webgpu only load (and evaluate) when a stage first mounts.
const HoloStageCanvas = lazy(() => import('@/components/holo-stage-canvas'));

/** After this long off-screen, the stage is disposed (re-inits on return, HoloFace meanwhile). */
const PARK_AFTER_MS = 30_000;

export type { StageBook };

type Props = {
	mode: 'pager' | 'single';
	books: StageBook[];
	/** On-screen card width (points); the rig is scaled to it. */
	cardWidth: number;
	/** Drawing-buffer pixel-ratio cap (Timeline 1.5, detail 2). */
	pixelRatioCap: number;
	activePage?: number;
	pageWidth?: number;
	scrollX?: SharedValue<number>;
	pressedPage?: number | null;
	/** Called with true on the first presented frame, false when the canvas goes away. */
	onReadyChange?: (ready: boolean) => void;
	style?: StyleProp<ViewStyle>;
};

/**
 * The 3D hologram stage (Timeline pager or detail hero). Owns layout, pausing and parking;
 * the canvas itself is lazy. Renders nothing when 3D is unavailable — callers show HoloFace.
 *
 * - Blurred (another screen/tab on top) → paused: no render/present.
 * - Blurred for 30 s, or app backgrounded → parked: canvas + device disposed.
 */
export function HoloStage({
	mode,
	books,
	cardWidth,
	pixelRatioCap,
	activePage = 0,
	pageWidth,
	scrollX,
	pressedPage = null,
	onReadyChange,
	style,
}: Props) {
	const status = useHoloStatus();
	const reduceMotion = useReduceMotion();
	const [size, setSize] = useState<{ width: number; height: number } | null>(null);
	const [focused, setFocused] = useState(true);
	const [parked, setParked] = useState(false);
	const [foreground, setForeground] = useState(AppState.currentState === 'active');

	useFocusEffect(
		useCallback(() => {
			setFocused(true);
			setParked(false);
			return () => setFocused(false);
		}, []),
	);

	useEffect(() => {
		if (focused) return;
		const timer = setTimeout(() => setParked(true), PARK_AFTER_MS);
		return () => clearTimeout(timer);
	}, [focused]);

	useEffect(() => {
		const sub = AppState.addEventListener('change', (state) => {
			const active = state === 'active';
			setForeground(active);
			if (!active) setParked(true);
			else setParked(false);
		});
		return () => sub.remove();
	}, []);

	const mounted = status.kind === 'available' && size !== null && !parked && foreground;
	useEffect(() => {
		if (!mounted) onReadyChange?.(false);
	}, [mounted, onReadyChange]);

	const handleFirstFrame = useCallback(() => onReadyChange?.(true), [onReadyChange]);

	if (status.kind === 'unavailable') return null;

	return (
		<View
			pointerEvents="none"
			accessible={false}
			importantForAccessibility="no-hide-descendants"
			style={[StyleSheet.absoluteFill, style]}
			onLayout={(e) => {
				const { width, height } = e.nativeEvent.layout;
				if (width > 0 && height > 0) setSize({ width, height });
			}}
		>
			{mounted && size ? (
				<Suspense fallback={null}>
					<HoloStageCanvas
						// Layout or card size changes rebuild the stage (rare: rotation / split view).
						key={`${size.width}x${size.height}@${cardWidth}`}
						mode={mode}
						books={books}
						width={size.width}
						height={size.height}
						cardWidth={cardWidth}
						pixelRatioCap={pixelRatioCap}
						activePage={activePage}
						pageWidth={pageWidth}
						scrollX={scrollX}
						pressedPage={pressedPage}
						paused={!focused}
						reduceMotion={reduceMotion}
						onFirstFrame={handleFirstFrame}
					/>
				</Suspense>
			) : null}
		</View>
	);
}
