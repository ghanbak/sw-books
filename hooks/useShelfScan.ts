import type { CameraView } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Gyroscope } from 'expo-sensors';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { type Book, useBooks, useUserBooks } from '@/lib/hooks';
import { recognizeImage } from '@/lib/ocr';
import {
	type BarcodeOutcome,
	buildIsbnIndex,
	highConfidenceBooks,
	isRepeatBarcode,
	mergeCapturedIntoMatches,
	prependCaptured,
	resolveBarcode,
} from '@/lib/scan-capture';
import { useScanSession } from '@/lib/scan-session';
import { ADD_OFFLINE_CODE, defaultSelection, pruneOwned } from '@/lib/shelf';
import { shelfQueue } from '@/lib/shelf-queue';
import {
	SHELF_SCAN_CONSTANTS,
	atCaptureCap,
	createCaptureGate,
	createStillNamer,
	initialShelfScanState,
	pendingOcrCount,
	shelfScanReducer,
	stillsToDelete,
	stillsToDeleteOnUnmount,
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
 * `takePictureAsync`), incremental per-still OCR, and the temp-file lifecycle
 * (only the current ghost still is kept on disk; everything else is deleted the
 * moment its OCR settles — bounded memory regardless of session length).
 *
 * The filesystem is treated as a second, slower participant in the state machine:
 * every saved still is registered in the reducer's file ledger (`state.files`, status
 * `pending | retained | deleted`), and one effect deletes whatever the ledger marks
 * `deleted`. The only file work outside it is what no reducer can own: a shutter that
 * lands after the session moved on (never registered), and OCR that settles after
 * unmount (`aliveRef`).
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
	const isbnIndex = useMemo(() => buildIsbnIndex(books), [books]);

	// Resume straight into Review when a draft survived a tab switch (the draft lives
	// in ScanSessionProvider precisely because native tabs unmount this screen).
	const [state, dispatch] = useReducer(shelfScanReducer, draft, (initialDraft) =>
		initialDraft ? { ...initialShelfScanState, phase: 'review' as const } : initialShelfScanState,
	);
	const stateRef = useRef(state);
	stateRef.current = state;

	const [addError, setAddError] = useState<string | null>(null);
	const [addedCount, setAddedCount] = useState(0);
	const [queuedCount, setQueuedCount] = useState(0);
	// Read after an await: a batch must only be queued for the user who is still signed in.
	const userIdRef = useRef(user?.id ?? null);
	userIdRef.current = user?.id ?? null;
	// Consecutive capture failures → a user-visible banner (see CAPTURE_FAILURE_LIMIT).
	const captureFailureStreakRef = useRef(0);
	const [captureError, setCaptureError] = useState<string | null>(null);

	// Books recognized so far (OCR or barcode), newest first — what the tray shows. The
	// ref is the truth at call time: a barcode and an OCR match can land in one batch.
	const [captured, setCapturedState] = useState<Book[]>([]);
	const capturedRef = useRef<Book[]>(captured);
	const setCaptured = useCallback((next: Book[]) => {
		if (next === capturedRef.current) return;
		capturedRef.current = next;
		setCapturedState(next);
	}, []);
	const lastBarcodeRef = useRef<{ data: string; at: number } | null>(null);

	// The component wires setCameraRef + onCameraReady to its <CameraView>; capture()
	// calls takePictureAsync via cameraRef. takePictureAsync throws before the camera is
	// ready, so capture() (and the auto-capture gate) hold off until onCameraReady fires.
	const cameraRef = useRef<CameraView | null>(null);
	const cameraReadyRef = useRef(false);
	// Callback ref so readiness resets when the view detaches: a new capturing session
	// (e.g. Start Over → scan again) remounts the CameraView, and a stale `ready` from the
	// previous mount would let a capture fire before the fresh feed is live. onCameraReady
	// flips it back true once the remounted camera is shootable.
	const setCameraRef = useCallback((instance: CameraView | null) => {
		cameraRef.current = instance;
		if (!instance) cameraReadyRef.current = false;
	}, []);
	const onCameraReady = useCallback(() => {
		cameraReadyRef.current = true;
	}, []);

	const gateRef = useRef(createCaptureGate());
	const captureInFlightRef = useRef(false);
	// Session-unique names, so a previous mount's late cleanup can't delete ours.
	const [nextStillName] = useState(() => createStillNamer());
	// Per-mount liveness token: a remount's orphan sweep must not receive files from
	// a previous instance's still-running capture pipeline, and once unmounted there is
	// no reducer left to own a still whose OCR settles late.
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
		try {
			const file = new File(uri);
			if (file.exists) file.delete();
		} catch (cause) {
			if (__DEV__) console.warn('[shelf-scan] still delete failed:', cause);
		}
	}, []);

	// Unmount sweep (tab blur, or a discard-via-mode-switch): delete the settled stills
	// now rather than leaving them for the next session's orphan sweep. OCR-pending
	// stills are left for their continuation, which sees aliveRef false and self-cleans —
	// never delete a file under a live OCR read.
	useEffect(() => {
		return () => {
			for (const uri of stillsToDeleteOnUnmount(stateRef.current.files)) deleteStill(uri);
		};
	}, [deleteStill]);

	// Temp-file lifecycle: the reducer's ledger marks a still `deleted` once nothing
	// needs it (settled and not the ghost, the ghost once capture is over, or a released
	// still whose OCR settled). Delete those, then acknowledge so the entries drop.
	const files = state.files;
	useEffect(() => {
		const owed = stillsToDelete(files);
		if (owed.length === 0) return;
		for (const uri of owed) deleteStill(uri);
		dispatch({ type: 'files_deleted', uris: owed });
	}, [files, deleteStill]);

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
			// After unmount the dispatch above was a no-op and no ledger owns this file —
			// clean up here. (A reset session still owns it: the ledger releases it.)
			if (!aliveRef.current) deleteStill(uri);
		},
		[deleteStill],
	);

	/** Take one still now — used by the auto-capture gate AND the manual shutter. */
	const capture = useCallback(async () => {
		if (captureInFlightRef.current) return;
		const current = stateRef.current;
		if (current.phase !== 'capturing' || atCaptureCap(current)) return;
		// Camera must be mounted and ready — takePictureAsync throws before onCameraReady,
		// and the gyro gate can fire in the brief window before the feed is live.
		const cam = cameraRef.current;
		if (!cam || !cameraReadyRef.current) return;
		captureInFlightRef.current = true;
		try {
			const photo = await Promise.race([
				// shutterSound:false keeps the capture silent; default processing leaves the
				// still EXIF-oriented (OCR accuracy depends on upright text, so don't skip it).
				cam.takePictureAsync({ shutterSound: false }),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('capture timed out')), CAPTURE_TIMEOUT_MS),
				),
			]);
			const file = new File(photo.uri);

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

			// Our own names — capture records are keyed by uri, so uniqueness is enforced
			// here rather than assumed of the camera's temp names.
			const destination = new File(scanDirectory(), nextStillName());
			file.move(destination);
			const uri = destination.uri;

			// Register the file first: if capture_taken is refused (a Finish/reset dispatched
			// but not yet rendered), the ledger still owns the file and releases it once
			// its OCR settles.
			dispatch({ type: 'still_saved', uri });
			dispatch({ type: 'capture_taken', uri });
			// A real still landed — clear any failure streak/banner.
			captureFailureStreakRef.current = 0;
			setCaptureError(null);
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); // best-effort
			// Fire-and-forget: OCR must not hold the in-flight guard, or captures
			// serialize behind OCR and steady-holds get eaten without firing.
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
	}, [recognizeStill, nextStillName]);

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
			// Don't sample while the shutter is open or before the camera can shoot — the
			// gate commits its fired state on a true sample, and a fire we can't honor
			// (capture in flight, or takePictureAsync not yet callable) would be destroyed,
			// making the user move-and-resteady to retry.
			if (captureInFlightRef.current || !cameraReadyRef.current) return;
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

	// Live tray: re-match the pooled fragments as each still's OCR lands, and prepend any
	// newly confident book. Fragments only grow within a session (reset empties them).
	const fragmentCount = state.fragments.length;
	useEffect(() => {
		if (fragmentCount === 0) return;
		const { phase, fragments } = stateRef.current;
		if (phase !== 'capturing' && phase !== 'interrupted') return;
		let matches: SpineMatch[] = [];
		try {
			matches = matchFragments(fragments, index);
		} catch (cause) {
			if (__DEV__) console.warn('[shelf-scan] live matching failed:', cause);
		}
		setCaptured(prependCaptured(capturedRef.current, highConfidenceBooks(matches)));
	}, [fragmentCount, index, setCaptured]);

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
		// Every tray book reaches review, incl. barcodes and stills whose OCR settled after
		// the last live pass.
		const tray = prependCaptured(capturedRef.current, highConfidenceBooks(matches));
		setCaptured(tray);
		const reviewed = mergeCapturedIntoMatches(matches, tray);
		setDraft(
			reviewed.length > 0
				? {
						ownerUserId: user?.id ?? null,
						matches: reviewed,
						selected: defaultSelection(reviewed, userBooks),
					}
				: null,
		);
		dispatch({ type: 'matched', matchCount: reviewed.length });
	}, [processingSettled, index, setDraft, setCaptured, user?.id, userBooks]);

	/**
	 * Continuous ISBN scanning: each catalog barcode prepends to the tray until Finish.
	 * Returns null for ignored frames (not capturing, or the same code still in view), so
	 * the caller only reacts to a real outcome.
	 */
	const scanBarcode = useCallback(
		(data: string): BarcodeOutcome | null => {
			if (stateRef.current.phase !== 'capturing') return null;
			const now = Date.now();
			const repeat = isRepeatBarcode(lastBarcodeRef.current, data, now);
			// Refresh on every frame: a code held in view stays one scan.
			lastBarcodeRef.current = { data, at: now };
			if (repeat) return null;
			const outcome = resolveBarcode(data, isbnIndex, capturedRef.current);
			if (outcome.type === 'added') {
				setCaptured(prependCaptured(capturedRef.current, [outcome.book]));
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
			}
			return outcome;
		},
		[isbnIndex, setCaptured],
	);
	/** After an error overlay is dismissed, the same code may be scanned again at once. */
	const rearmBarcode = useCallback(() => {
		lastBarcodeRef.current = null;
	}, []);

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
		const ownerId = userIdRef.current;
		try {
			const result = await addOwned(ids);
			if (result.ok) {
				setAddedCount(result.data.rows.length);
				setDraft(null); // draft consumed — a later tab-return starts a fresh session
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
				dispatch({ type: 'add_succeeded' });
			} else if (
				result.error.code === ADD_OFFLINE_CODE &&
				ownerId !== null &&
				ownerId === userIdRef.current &&
				(await shelfQueue.enqueue(ownerId, ids))
			) {
				// Only connectivity failures reach here; ShelfQueueSync replays the batch.
				setQueuedCount(ids.length);
				setDraft(null);
				Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
				dispatch({ type: 'add_queued' });
			} else {
				// Not queueable (auth/RLS/validation) or unstorable: block, keep the draft.
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
		// The reducer releases this session's stills: settled ones are deleted by the
		// lifecycle effect, OCR-pending ones once their read settles.
		setAddError(null);
		setAddedCount(0);
		setQueuedCount(0);
		captureFailureStreakRef.current = 0;
		setCaptureError(null);
		setCaptured([]);
		lastBarcodeRef.current = null;
		setDraft(null);
		dispatch({ type: 'reset' });
	}, [setDraft, setCaptured]);

	// Account-switch safety net: ScanSessionProvider clears the draft when a different
	// user signs in — a Review with nothing to review must fall back to capturing.
	// Full reset() (not a bare dispatch): a stale addError from the previous session
	// must not greet the next one.
	useEffect(() => {
		if (state.phase === 'review' && !draft) reset();
	}, [state.phase, draft, reset]);

	return {
		state,
		/** Wire to `<CameraView ref={setCameraRef} onCameraReady={onCameraReady}>`. */
		setCameraRef,
		onCameraReady,
		captureCount: state.captures.length,
		/** Recognized books, newest first (tray order). */
		captured,
		scanBarcode,
		rearmBarcode,
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
		queuedCount,
		/** Set after repeated capture failures so the HUD can warn the user (Phase 5). */
		captureError,
	};
}
