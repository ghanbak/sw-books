import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Gyroscope } from 'expo-sensors';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import { usePhotoOutput, usePreviewOutput } from 'react-native-vision-camera';

import { useAuth } from '@/lib/auth';
import { useBooks, useUserBooks } from '@/lib/hooks';
import { recognizeImage } from '@/lib/ocr';
import { useScanSession } from '@/lib/scan-session';
import { defaultSelection } from '@/lib/shelf';
import {
	SHELF_SCAN_CONSTANTS,
	atCaptureCap,
	createCaptureGate,
	ghostUri,
	initialShelfScanState,
	pendingOcrCount,
	shelfScanReducer,
} from '@/lib/shelf-scan';
import { type SpineMatch, buildCatalogIndex, matchFragments } from '@/lib/spine-match';

/** Gyro sample cadence for the steadiness gate (10 Hz is plenty for hand motion). */
const GYRO_INTERVAL_MS = 100;

/**
 * Bail out of a capture whose native promise never settles (e.g. the session was
 * deactivated mid-shutter) — otherwise the in-flight guard would brick the scanner
 * for the rest of the session.
 */
const CAPTURE_TIMEOUT_MS = 8000;

/** All session stills live here — a fixed dir makes the startup orphan sweep trivial. */
function scanDirectory(): Directory {
	return new Directory(Paths.cache, 'shelf-scan');
}

/**
 * The shelf-scanner capture engine (plan Phase 3). Owns the flow reducer
 * (`lib/shelf-scan.ts`), hands-free auto-capture (gyro steadiness gate →
 * `capturePhotoToFile`), incremental per-still OCR, and the temp-file lifecycle
 * (only the current ghost still is kept on disk; everything else is deleted the
 * moment its OCR settles — bounded memory regardless of session length).
 *
 * The filesystem is treated as a second, slower participant in the state machine:
 * every async continuation re-checks intent (`aliveRef` + reducer phase) before
 * moving/keeping a file, and deletes it when the session has moved on.
 *
 * On Finish it waits for in-flight OCR, runs the matcher over the pooled
 * fragments, and publishes the draft to `ScanSessionProvider` (which is what
 * survives tab switches — this hook's state does not need to).
 *
 * @param enabled gates the camera + sensors — pass `isFocused && permissionGranted`.
 */
export function useShelfScan({ enabled }: { enabled: boolean }) {
	const { user } = useAuth();
	const { books } = useBooks();
	const { userBooks } = useUserBooks();
	const { setDraft } = useScanSession();

	const index = useMemo(() => buildCatalogIndex(books), [books]);

	const [state, dispatch] = useReducer(shelfScanReducer, initialShelfScanState);
	const stateRef = useRef(state);
	stateRef.current = state;

	const previewOutput = usePreviewOutput();
	// Defaults only — 'speed' qualityPrioritization throws on devices without
	// supportsSpeedQualityPrioritization, and OCR likes resolution anyway.
	const photoOutput = usePhotoOutput();

	const gateRef = useRef(createCaptureGate());
	const captureInFlightRef = useRef(false);
	const deletedUrisRef = useRef(new Set<string>());
	const stillSeqRef = useRef(0);
	// Per-mount liveness token: a remount's orphan sweep must not receive files from
	// a previous instance's still-running capture pipeline.
	const aliveRef = useRef(true);
	useEffect(() => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
		};
	}, []);

	// Startup orphan sweep: stills from a session the app died inside would otherwise
	// linger in the cache until the OS evicts them.
	useEffect(() => {
		const dir = scanDirectory();
		try {
			if (dir.exists) dir.delete();
			dir.create({ intermediates: true, idempotent: true });
		} catch (cause) {
			if (__DEV__) console.warn('[shelf-scan] orphan sweep failed:', cause);
		}
	}, []);

	const deleteStill = useCallback((uri: string) => {
		if (deletedUrisRef.current.has(uri)) return;
		deletedUrisRef.current.add(uri);
		try {
			const file = new File(uri);
			if (file.exists) file.delete();
		} catch (cause) {
			if (__DEV__) console.warn('[shelf-scan] still delete failed:', cause);
		}
	}, []);

	// Temp-file lifecycle, derived from reducer state: every settled still except the
	// current ghost is deleted; once the session leaves capture (review/done/adding),
	// the ghost goes too. OCR-pending stills are never touched (never delete a file
	// ML Kit may be reading). Captures that LEAVE state (reset, dropped dispatches)
	// are invisible here — their continuations below clean up after themselves.
	useEffect(() => {
		const ghost = ghostUri(state);
		// The ghost still is needed while more capturing could follow (incl. Empty's
		// "keep scanning" and processing, where its OCR may still be settling).
		const ghostStillNeeded =
			state.phase === 'capturing' ||
			state.phase === 'interrupted' ||
			state.phase === 'processing' ||
			state.phase === 'empty';
		for (const capture of state.captures) {
			if (capture.ocr === 'pending') continue;
			if (capture.uri === ghost && ghostStillNeeded) continue;
			deleteStill(capture.uri);
		}
	}, [state, deleteStill]);

	/** Incremental OCR continuation — runs detached so captures never serialize on it. */
	const recognizeStill = useCallback(
		async (uri: string) => {
			const result = await recognizeImage(uri);
			if (result.ok) {
				dispatch({ type: 'ocr_finished', uri, fragments: result.data });
			} else if (result.error.code === 'no_text') {
				// A blurry/empty frame is a benign zero-fragment capture, not a failure.
				dispatch({ type: 'ocr_finished', uri, fragments: [] });
			} else {
				if (__DEV__) console.warn('[shelf-scan] OCR failed:', result.error.message);
				dispatch({ type: 'ocr_failed', uri });
			}
			// If the session moved on (reset/unmount) the dispatch above was a no-op and
			// the lifecycle effect can no longer see this uri — clean up here instead.
			if (!aliveRef.current || !stateRef.current.captures.some((c) => c.uri === uri)) {
				deleteStill(uri);
			}
		},
		[deleteStill],
	);

	/** Take one still now — used by the auto-capture gate AND the manual shutter. */
	const capture = useCallback(async () => {
		if (captureInFlightRef.current) return;
		const current = stateRef.current;
		if (current.phase !== 'capturing' || atCaptureCap(current)) return;
		captureInFlightRef.current = true;
		try {
			const photo = await Promise.race([
				photoOutput.capturePhotoToFile({ enableShutterSound: false }, {}),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('capture timed out')), CAPTURE_TIMEOUT_MS),
				),
			]);
			const file = new File(`file://${photo.filePath}`);

			// Re-check intent AFTER the shutter: Finish/reset/unmount may have landed
			// while the photo was being taken. Drop deliberately — delete, don't move,
			// don't OCR (a capture_taken dispatch would be ignored and orphan the file).
			const next = stateRef.current;
			if (!aliveRef.current || next.phase !== 'capturing' || atCaptureCap(next)) {
				try {
					file.delete();
				} catch {
					// best-effort — the OS temp dir is the backstop
				}
				return;
			}

			// Our own sequential names — capture records are keyed by uri, so uniqueness
			// is enforced here rather than assumed of the camera's temp names.
			stillSeqRef.current += 1;
			const destination = new File(scanDirectory(), `still-${stillSeqRef.current}.jpg`);
			file.move(destination);
			const uri = destination.uri;

			dispatch({ type: 'capture_taken', uri });
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); // best-effort
			// Fire-and-forget: OCR must not hold the in-flight guard, or captures
			// serialize behind ML Kit and steady-holds get eaten without firing.
			void recognizeStill(uri);
		} catch (cause) {
			if (__DEV__) console.warn('[shelf-scan] capture failed:', cause);
		} finally {
			captureInFlightRef.current = false;
		}
	}, [photoOutput, recognizeStill]);

	// Hands-free auto-capture: steady-hold fires the gate; movement between captures
	// is required, so resting on a framing never duplicates stills.
	const autoCaptureActive = enabled && state.phase === 'capturing' && !atCaptureCap(state);
	useEffect(() => {
		if (!autoCaptureActive) return;
		Gyroscope.setUpdateInterval(GYRO_INTERVAL_MS);
		const subscription = Gyroscope.addListener(({ x, y, z }) => {
			// Don't sample while the shutter is open — the gate commits its fired state
			// on a true sample, and a fire we can't honor would be silently destroyed.
			if (captureInFlightRef.current) return;
			const magnitude = Math.sqrt(x * x + y * y + z * z);
			if (gateRef.current.sample(magnitude, Date.now())) capture();
		});
		return () => subscription.remove();
	}, [autoCaptureActive, capture]);

	// Interruption: only a real backgrounding pauses the loop (iOS fires 'inactive'
	// for Control Center / notification-shade blips — those must not flash Paused).
	useEffect(() => {
		const subscription = AppState.addEventListener('change', (status) => {
			if (status === 'background') {
				dispatch({ type: 'interrupted' });
			} else if (status === 'active') {
				gateRef.current.reset();
				dispatch({ type: 'resumed' });
			}
		});
		return () => subscription.remove();
	}, []);

	// Finish settles → match the pooled fragments and publish the draft. The draft —
	// not this reducer — is what the review overlay (Phase 4) reads, and what
	// survives tab switches. Always dispatches `matched`, even if the matcher throws —
	// the alternative is an eternal "Reading spines…".
	const processingSettled = state.phase === 'processing' && pendingOcrCount(state) === 0;
	useEffect(() => {
		if (!processingSettled) return;
		let matches: SpineMatch[] = [];
		try {
			matches = matchFragments(stateRef.current.fragments, index);
		} catch (cause) {
			if (__DEV__) console.warn('[shelf-scan] matching failed:', cause);
		}
		setDraft(
			matches.length > 0
				? {
						ownerUserId: user?.id ?? null,
						matches,
						selected: defaultSelection(matches, userBooks),
					}
				: null,
		);
		dispatch({ type: 'matched', matchCount: matches.length });
	}, [processingSettled, index, setDraft, user?.id, userBooks]);

	const finish = useCallback(() => dispatch({ type: 'finished' }), []);
	const keepScanning = useCallback(() => dispatch({ type: 'continued' }), []);
	const reset = useCallback(() => {
		// Captures leave state on reset, taking their files out of the lifecycle
		// effect's sight — delete the settled ones now. Pending-OCR stills are left
		// for their recognizeStill continuation (never delete under a ML Kit read).
		for (const capture of stateRef.current.captures) {
			if (capture.ocr !== 'pending') deleteStill(capture.uri);
		}
		setDraft(null);
		dispatch({ type: 'reset' });
	}, [setDraft, deleteStill]);

	return {
		state,
		/** Connect both to the `<Camera outputs={…}>`. */
		previewOutput,
		photoOutput,
		ghostUri: ghostUri(state),
		captureCount: state.captures.length,
		atCap: atCaptureCap(state),
		maxCaptures: SHELF_SCAN_CONSTANTS.MAX_CAPTURES,
		/** Manual shutter — the VoiceOver/TalkBack path, and an impatience escape hatch. */
		captureNow: capture,
		finish,
		keepScanning,
		reset,
	};
}
