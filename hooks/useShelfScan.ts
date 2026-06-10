import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Gyroscope } from 'expo-sensors';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePhotoOutput, usePreviewOutput } from 'react-native-vision-camera';

import { useAuth } from '@/lib/auth';
import { useBooks, useUserBooks } from '@/lib/hooks';
import { recognizeImage } from '@/lib/ocr';
import { useScanSession } from '@/lib/scan-session';
import { defaultSelection, pruneOwned } from '@/lib/shelf';
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

/**
 * After this many consecutive capture failures (shutter throw / timeout / file move),
 * surface a banner — otherwise a user whose every capture silently fails just sees the
 * "hold steady" hint forever (Phase 3 review finding).
 */
const CAPTURE_FAILURE_LIMIT = 3;

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
 * @param manualOnly disables the hands-free gyro auto-capture loop (the manual shutter
 *   still works). Used for the VoiceOver/TalkBack path: steadiness gating is meaningless
 *   when the user can't see the framing, and a surprise auto-fire is worse than none.
 */
export function useShelfScan({
	enabled,
	manualOnly = false,
}: {
	enabled: boolean;
	manualOnly?: boolean;
}) {
	const { user } = useAuth();
	const { books } = useBooks();
	const { userBooks, addOwned } = useUserBooks();
	const { draft, setDraft, getDraft } = useScanSession();

	const index = useMemo(() => buildCatalogIndex(books), [books]);

	// Resume straight into Review when a draft survived a tab switch (the draft lives
	// in ScanSessionProvider precisely because native tabs unmount this screen).
	const [state, dispatch] = useReducer(shelfScanReducer, draft, (initialDraft) =>
		initialDraft ? { ...initialShelfScanState, phase: 'review' as const } : initialShelfScanState,
	);
	const stateRef = useRef(state);
	stateRef.current = state;

	const [addError, setAddError] = useState<string | null>(null);
	const [addedCount, setAddedCount] = useState(0);
	// Consecutive capture failures → a user-visible banner (see CAPTURE_FAILURE_LIMIT).
	const captureFailureStreakRef = useRef(0);
	const [captureError, setCaptureError] = useState<string | null>(null);

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

	// Unmount sweep (tab blur, or a discard-via-mode-switch): delete the settled stills
	// now rather than leaving them for the next session's orphan sweep. Pending-OCR
	// stills are left for their continuation, which sees aliveRef false and self-cleans —
	// never delete a file under a live ML Kit read.
	useEffect(() => {
		return () => {
			for (const capture of stateRef.current.captures) {
				if (capture.ocr !== 'pending') deleteStill(capture.uri);
			}
		};
	}, [deleteStill]);

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
			// A real still landed — clear any failure streak/banner.
			captureFailureStreakRef.current = 0;
			setCaptureError(null);
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); // best-effort
			// Fire-and-forget: OCR must not hold the in-flight guard, or captures
			// serialize behind ML Kit and steady-holds get eaten without firing.
			void recognizeStill(uri);
		} catch (cause) {
			if (__DEV__) console.warn('[shelf-scan] capture failed:', cause);
			// Only count failures from a live capturing session. A rejection that lands
			// after Finish/interrupt/reset (incl. the timeout when the session deactivated
			// mid-shutter) is not a camera fault and must not resurrect the banner.
			if (aliveRef.current && stateRef.current.phase === 'capturing') {
				captureFailureStreakRef.current += 1;
				if (captureFailureStreakRef.current >= CAPTURE_FAILURE_LIMIT) {
					setCaptureError(
						"Photos aren't saving. Check lighting and that nothing covers the camera.",
					);
				}
			}
		} finally {
			captureInFlightRef.current = false;
		}
	}, [photoOutput, recognizeStill]);

	// Hands-free auto-capture: steady-hold fires the gate; movement between captures
	// is required, so resting on a framing never duplicates stills.
	const autoCaptureActive =
		enabled && !manualOnly && state.phase === 'capturing' && !atCaptureCap(state);
	useEffect(() => {
		if (!autoCaptureActive) return;
		// Cold start of the loop (first entry, intro dismiss, "keep scanning", resume):
		// require movement before the first auto-fire so a still phone pointed away from
		// the shelf doesn't snap a phantom photo the instant capturing turns on.
		gateRef.current.reset(true);
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
				// A capture that failed *because* of the backgrounding shouldn't count
				// toward the "camera is broken" streak — a return is a fresh start.
				captureFailureStreakRef.current = 0;
				setCaptureError(null);
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

	/** Batch-add the draft's selection to the owned shelf (Review → Adding → Done). */
	const addInFlightRef = useRef(false);
	const addSelected = useCallback(async () => {
		// Synchronous re-entrancy guard: `disabled={adding}` and the phase check are
		// both render-synced — a rapid double-tap passes both and would fire two
		// concurrent RPCs whose optimistic snapshots can revert each other's merge.
		if (addInFlightRef.current) return;
		if (stateRef.current.phase !== 'review') return;
		// Truth at call time (getDraft) + live-ownership prune: a book marked owned
		// after the scan must not be re-sent (and must not inflate addedCount).
		const currentDraft = getDraft();
		const ids = currentDraft ? pruneOwned(currentDraft.selected, userBooks) : [];
		if (ids.length === 0) return;
		addInFlightRef.current = true;
		setAddError(null);
		dispatch({ type: 'add_started' });
		try {
			const result = await addOwned(ids);
			if (result.ok) {
				setAddedCount(result.data.rows.length);
				setDraft(null); // draft consumed — a later tab-return starts a fresh session
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
				dispatch({ type: 'add_succeeded' });
			} else {
				// v1 offline policy: block, keep the draft, let the user retry (plan §Decision 3).
				setAddError(
					result.error.code === 'not_signed_in'
						? result.error.message
						: "Couldn't save — check your connection and try again. Your scan is safe.",
				);
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
				dispatch({ type: 'add_blocked' });
			}
		} catch (cause) {
			// addOwned returns Result and shouldn't throw — but a throw here would
			// otherwise strand the user in `adding` behind a disabled UI forever.
			if (__DEV__) console.warn('[shelf-scan] add threw:', cause);
			setAddError("Couldn't save — check your connection and try again. Your scan is safe.");
			Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
			dispatch({ type: 'add_blocked' });
		} finally {
			addInFlightRef.current = false;
		}
	}, [addOwned, getDraft, setDraft, userBooks]);

	const finish = useCallback(() => {
		// Haptics map: capture = Light impact, finish = Medium, add-success = Success,
		// add-blocked = Error (below). Best-effort — never block the flow on haptics.
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
		dispatch({ type: 'finished' });
	}, []);
	const keepScanning = useCallback(() => {
		// Fresh attempt — don't carry a stale failure banner into the resumed loop.
		captureFailureStreakRef.current = 0;
		setCaptureError(null);
		dispatch({ type: 'continued' });
	}, []);
	const reset = useCallback(() => {
		// Captures leave state on reset, taking their files out of the lifecycle
		// effect's sight — delete the settled ones now. Pending-OCR stills are left
		// for their recognizeStill continuation (never delete under a ML Kit read).
		for (const capture of stateRef.current.captures) {
			if (capture.ocr !== 'pending') deleteStill(capture.uri);
		}
		setAddError(null);
		setAddedCount(0);
		captureFailureStreakRef.current = 0;
		setCaptureError(null);
		setDraft(null);
		dispatch({ type: 'reset' });
	}, [setDraft, deleteStill]);

	// Account-switch safety net: ScanSessionProvider clears the draft when a different
	// user signs in — a Review with nothing to review must fall back to capturing.
	// Full reset() (not a bare dispatch): a stale addError from the previous session
	// must not greet the next one.
	useEffect(() => {
		if (state.phase === 'review' && !draft) reset();
	}, [state.phase, draft, reset]);

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
		/** Review-overlay add flow (Phase 4). */
		addSelected,
		addError,
		addedCount,
		/** Set after repeated capture failures so the HUD can warn the user (Phase 5). */
		captureError,
	};
}
