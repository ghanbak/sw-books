import type { OcrFragment } from '@/lib/spine-match';

/**
 * Pure state core for the shelf-scanner capture flow (plan Decision 4): the
 * `useReducer` state machine behind `hooks/useShelfScan.ts`, plus the auto-capture
 * gate. No React/native imports — everything here unit-tests in the node vitest env.
 *
 * The flow states mirror the plan's state chart exactly:
 *
 *   Capturing → (auto-capture loop) → Processing → Review | Empty
 *   Capturing ⇄ Interrupted (call / background; captures preserved)
 *   Review → Adding → Done, or Adding → Review (offline → block + keep draft)
 *   Empty → Capturing (keep scanning)
 *
 * Prereq conditions (signed-out, camera-denied, catalog-loading/failed) are derived
 * at render and gate entry into Capturing — they are NOT reducer states.
 */

/** Provisional capture tuning — device QA in Phase 3/6 calibrates these. */
export const SHELF_SCAN_CONSTANTS = {
	/** Hard cap on stills per session (bounded memory; UI nudges Finish at the cap). */
	MAX_CAPTURES: 20,
	/** Gyro rotation-rate magnitude (rad/s) at or below which the device counts as steady. */
	STEADY_MAX_MAGNITUDE: 0.15,
	/** How long the device must hold steady before a capture fires. */
	STEADY_HOLD_MS: 600,
	/** Minimum spacing between auto-captures. */
	MIN_CAPTURE_INTERVAL_MS: 1200,
} as const;

export type ShelfScanPhase =
	| 'capturing'
	| 'interrupted'
	| 'processing'
	| 'review'
	| 'empty'
	| 'adding'
	| 'done';

export type CaptureOcrStatus = 'pending' | 'done' | 'failed';

export type CaptureRecord = {
	/** `file://` URI of the still (deleted from disk once it stops being the ghost). */
	uri: string;
	ocr: CaptureOcrStatus;
};

export type ShelfScanState = {
	phase: ShelfScanPhase;
	captures: CaptureRecord[];
	/** OCR fragments accumulated incrementally across all captures (cross-photo bag). */
	fragments: OcrFragment[];
};

export type ShelfScanAction =
	| { type: 'capture_taken'; uri: string }
	| { type: 'ocr_finished'; uri: string; fragments: OcrFragment[] }
	| { type: 'ocr_failed'; uri: string }
	| { type: 'interrupted' }
	| { type: 'resumed' }
	| { type: 'finished' }
	| { type: 'matched'; matchCount: number }
	| { type: 'continued' }
	| { type: 'add_started' }
	| { type: 'add_blocked' }
	| { type: 'add_succeeded' }
	| { type: 'reset' };

export const initialShelfScanState: ShelfScanState = {
	phase: 'capturing',
	captures: [],
	fragments: [],
};

function setOcrStatus(
	captures: CaptureRecord[],
	uri: string,
	ocr: CaptureOcrStatus,
): CaptureRecord[] {
	return captures.map((c) => (c.uri === uri ? { ...c, ocr } : c));
}

/**
 * Pure transition function. Actions that are invalid for the current phase are
 * ignored (return the state unchanged) — async results (OCR, stale UI events)
 * can land after a phase change without corrupting the flow.
 */
export function shelfScanReducer(state: ShelfScanState, action: ShelfScanAction): ShelfScanState {
	switch (action.type) {
		case 'capture_taken': {
			if (state.phase !== 'capturing') return state;
			if (state.captures.length >= SHELF_SCAN_CONSTANTS.MAX_CAPTURES) return state;
			return {
				...state,
				captures: [...state.captures, { uri: action.uri, ocr: 'pending' }],
			};
		}
		case 'ocr_finished': {
			// Valid in any phase — OCR is async and may settle after Interrupted/Finish.
			if (!state.captures.some((c) => c.uri === action.uri && c.ocr === 'pending')) return state;
			return {
				...state,
				captures: setOcrStatus(state.captures, action.uri, 'done'),
				fragments: [...state.fragments, ...action.fragments],
			};
		}
		case 'ocr_failed': {
			if (!state.captures.some((c) => c.uri === action.uri && c.ocr === 'pending')) return state;
			return { ...state, captures: setOcrStatus(state.captures, action.uri, 'failed') };
		}
		case 'interrupted':
			return state.phase === 'capturing' ? { ...state, phase: 'interrupted' } : state;
		case 'resumed':
			return state.phase === 'interrupted' ? { ...state, phase: 'capturing' } : state;
		case 'finished':
			return state.phase === 'capturing' ? { ...state, phase: 'processing' } : state;
		case 'matched': {
			if (state.phase !== 'processing') return state;
			return { ...state, phase: action.matchCount > 0 ? 'review' : 'empty' };
		}
		case 'continued':
			// Keep captures + fragments — "keep scanning" extends the session.
			return state.phase === 'empty' ? { ...state, phase: 'capturing' } : state;
		case 'add_started':
			return state.phase === 'review' ? { ...state, phase: 'adding' } : state;
		case 'add_blocked':
			// Offline at Add → back to review, draft intact (v1: no queue).
			return state.phase === 'adding' ? { ...state, phase: 'review' } : state;
		case 'add_succeeded':
			return state.phase === 'adding' ? { ...state, phase: 'done' } : state;
		case 'reset':
			return initialShelfScanState;
	}
}

/** Captures whose OCR has not settled yet — Processing waits for this to hit 0. */
export function pendingOcrCount(state: ShelfScanState): number {
	return state.captures.filter((c) => c.ocr === 'pending').length;
}

/** The previous still, shown as the low-opacity overlap guide. */
export function ghostUri(state: ShelfScanState): string | null {
	return state.captures.length > 0 ? state.captures[state.captures.length - 1].uri : null;
}

/** At the photo cap → auto-capture stops and the UI nudges Finish. */
export function atCaptureCap(state: ShelfScanState): boolean {
	return state.captures.length >= SHELF_SCAN_CONSTANTS.MAX_CAPTURES;
}

/** What the mode host needs to place + guard the floating switcher (plan Phase 5). */
export type ShelfChrome = {
	/** The review overlay owns the screen — the host hides the floating switcher. */
	immersive: boolean;
	/** Un-Finished work a mode switch would discard — the host confirms first. */
	dirty: boolean;
};

/**
 * Derive the host chrome from the capture phase. Pure so the immersive/dirty table is
 * unit-tested rather than reasoned about by hand. `dirty` is true whenever a switch
 * would lose work: any phase that isn't pristine capture (0 photos) and isn't `done`
 * (already saved). Note a published draft only exists in the immersive phases
 * (review/adding/done), where the switcher is hidden — so the host never needs to
 * clear a draft on a switch it actually allows.
 */
export function deriveShelfChrome(phase: ShelfScanPhase, captureCount: number): ShelfChrome {
	const immersive = phase === 'review' || phase === 'adding' || phase === 'done';
	const dirty = phase !== 'done' && !(phase === 'capturing' && captureCount === 0);
	return { immersive, dirty };
}

export type CaptureGateConfig = {
	steadyMaxMagnitude: number;
	steadyHoldMs: number;
	minIntervalMs: number;
};

export type CaptureGate = {
	/**
	 * Feed one motion sample (gyro rotation-rate magnitude, rad/s); returns true
	 * exactly when an auto-capture should fire.
	 */
	sample(magnitude: number, nowMs: number): boolean;
	/**
	 * Forget steadiness/movement history. Pass `requireInitialMovement` (cold start of
	 * the capture loop — entering capture, dismissing the intro, "keep scanning") so the
	 * first auto-fire only happens AFTER the user has moved the phone into framing; a
	 * still phone pointed at a lap/floor then won't snap a phantom first photo.
	 */
	reset(requireInitialMovement?: boolean): void;
};

/**
 * Hands-free auto-capture gating: fire when the device has held steady for
 * `steadyHoldMs`, at most once per `minIntervalMs`, and only after the device has
 * MOVED since the previous capture — holding perfectly still never produces two
 * stills of the same framing.
 */
export function createCaptureGate(
	config: CaptureGateConfig = {
		steadyMaxMagnitude: SHELF_SCAN_CONSTANTS.STEADY_MAX_MAGNITUDE,
		steadyHoldMs: SHELF_SCAN_CONSTANTS.STEADY_HOLD_MS,
		minIntervalMs: SHELF_SCAN_CONSTANTS.MIN_CAPTURE_INTERVAL_MS,
	},
): CaptureGate {
	let steadySince: number | null = null;
	let lastFiredAt: number | null = null;
	let movedSinceFire = true; // first capture needs no prior movement

	return {
		sample(magnitude, nowMs) {
			if (magnitude > config.steadyMaxMagnitude) {
				steadySince = null;
				movedSinceFire = true;
				return false;
			}
			if (!movedSinceFire) return false;
			if (steadySince === null) steadySince = nowMs;
			if (nowMs - steadySince < config.steadyHoldMs) return false;
			if (lastFiredAt !== null && nowMs - lastFiredAt < config.minIntervalMs) return false;
			lastFiredAt = nowMs;
			steadySince = null;
			movedSinceFire = false;
			return true;
		},
		reset(requireInitialMovement = false) {
			steadySince = null;
			movedSinceFire = !requireInitialMovement;
		},
	};
}
