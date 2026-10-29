import { useIsFocused } from 'expo-router/react-navigation';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
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
	/** True once the 3D card (with its cover) is on screen; false when the canvas goes away. */
	onReadyChange?: (ready: boolean) => void;
	/** A cover failed to load; the 3D card shows a tint, so callers show its title. */
	onCoverFailed?: (index: number) => void;
	/** Indices whose 3D card shows its cover (or starfield); the others still show a tint. */
	onResidentChange?: (indices: number[]) => void;
	style?: StyleProp<ViewStyle>;
};

/**
 * The 3D hologram stage (Timeline pager or detail hero). Owns layout, pausing and parking;
 * the canvas itself is lazy. Renders nothing when 3D is unavailable — callers show HoloFace.
 *
 * - Blurred (another screen/tab on top) or app inactive → paused: no render/present.
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
	onCoverFailed,
	onResidentChange,
	style,
}: Props) {
	const status = useHoloStatus();
	const reduceMotion = useReduceMotion();
	const [size, setSize] = useState<{ width: number; height: number } | null>(null);
	// Not useFocusEffect + a `true` default: native tabs mount screens that are never focused
	// (and that hook only reports blur after a focus), so a hidden tab would render 3D at full rate.
	const focused = useIsFocused();
	// A stage that mounts unfocused stays parked (no device) until its screen is first shown.
	const [parked, setParked] = useState(!focused);
	const [appState, setAppState] = useState(AppState.currentState);
	const focusedRef = useRef(focused);

	useEffect(() => {
		focusedRef.current = focused;
		if (focused) {
			setParked(false);
			return;
		}
		const timer = setTimeout(() => setParked(true), PARK_AFTER_MS);
		return () => clearTimeout(timer);
	}, [focused]);

	useEffect(() => {
		const sub = AppState.addEventListener('change', (state) => {
			setAppState(state);
			// Backgrounded → park (release the device). Coming back only un-parks a focused stage:
			// a blurred one stays parked and re-inits on focus.
			if (state === 'background') setParked(true);
			else if (state === 'active' && focusedRef.current) setParked(false);
		});
		return () => sub.remove();
	}, []);

	// `inactive` (Control Center, app switcher, Face ID, call banners) only pauses — no teardown.
	const mounted =
		status.kind === 'available' && size !== null && !parked && appState !== 'background';
	const handleReadyChange = useCallback(
		(ready: boolean) => onReadyChange?.(ready),
		[onReadyChange],
	);
	const handleCoverFailed = useCallback((index: number) => onCoverFailed?.(index), [onCoverFailed]);
	const handleResidentChange = useCallback(
		(indices: number[]) => onResidentChange?.(indices),
		[onResidentChange],
	);

	if (status.kind === 'unavailable') return null;

	return (
		<View
			pointerEvents="none"
			accessible={false}
			accessibilityElementsHidden
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
						paused={!focused || appState !== 'active'}
						reduceMotion={reduceMotion}
						onReadyChange={handleReadyChange}
						onCoverFailed={handleCoverFailed}
						onResidentChange={handleResidentChange}
					/>
				</Suspense>
			) : null}
		</View>
	);
}
