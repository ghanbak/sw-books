import {
	SHELF_SCAN_CONSTANTS,
	type ShelfScanAction,
	type ShelfScanState,
	atCaptureCap,
	createCaptureGate,
	deriveShelfChrome,
	ghostUri,
	initialShelfScanState,
	pendingOcrCount,
	shelfScanReducer,
	stillsToDelete,
	stillsToDeleteOnUnmount,
} from '@/lib/shelf-scan';
import { describe, expect, it } from 'vitest';

const run = (actions: ShelfScanAction[], from = initialShelfScanState): ShelfScanState =>
	actions.reduce(shelfScanReducer, from);

describe('shelfScanReducer — capture loop', () => {
	it('starts in capturing with no captures', () => {
		expect(initialShelfScanState.phase).toBe('capturing');
		expect(ghostUri(initialShelfScanState)).toBeNull();
	});

	it('records a capture as ocr-pending and makes it the ghost', () => {
		const s = run([{ type: 'capture_taken', uri: 'a.jpg' }]);
		expect(s.captures).toEqual([{ uri: 'a.jpg', ocr: 'pending' }]);
		expect(ghostUri(s)).toBe('a.jpg');
		expect(pendingOcrCount(s)).toBe(1);
	});

	it('accumulates fragments incrementally as OCR settles per capture', () => {
		const s = run([
			{ type: 'capture_taken', uri: 'a.jpg' },
			{ type: 'capture_taken', uri: 'b.jpg' },
			{ type: 'ocr_finished', uri: 'a.jpg', fragments: [{ text: 'HEIR TO THE EMPIRE' }] },
			{ type: 'ocr_finished', uri: 'b.jpg', fragments: [{ text: 'DARTH PLAGUEIS' }] },
		]);
		expect(s.fragments.map((f) => f.text)).toEqual(['HEIR TO THE EMPIRE', 'DARTH PLAGUEIS']);
		expect(pendingOcrCount(s)).toBe(0);
		expect(ghostUri(s)).toBe('b.jpg'); // latest still guides the next overlap
	});

	it('marks a capture failed without losing other fragments', () => {
		const s = run([
			{ type: 'capture_taken', uri: 'a.jpg' },
			{ type: 'capture_taken', uri: 'b.jpg' },
			{ type: 'ocr_finished', uri: 'a.jpg', fragments: [{ text: 'THRAWN' }] },
			{ type: 'ocr_failed', uri: 'b.jpg' },
		]);
		expect(s.captures.find((c) => c.uri === 'b.jpg')?.ocr).toBe('failed');
		expect(s.fragments).toHaveLength(1);
		expect(pendingOcrCount(s)).toBe(0);
	});

	it('ignores OCR results for unknown or already-settled uris (stale async)', () => {
		const settled = run([
			{ type: 'capture_taken', uri: 'a.jpg' },
			{ type: 'ocr_finished', uri: 'a.jpg', fragments: [{ text: 'X' }] },
		]);
		expect(
			shelfScanReducer(settled, { type: 'ocr_finished', uri: 'a.jpg', fragments: [{ text: 'X' }] }),
		).toBe(settled);
		expect(shelfScanReducer(settled, { type: 'ocr_failed', uri: 'ghost.jpg' })).toBe(settled);
	});

	it('refuses captures beyond MAX_CAPTURES and reports the cap', () => {
		const actions: ShelfScanAction[] = Array.from(
			{ length: SHELF_SCAN_CONSTANTS.MAX_CAPTURES + 3 },
			(_, i) => ({ type: 'capture_taken' as const, uri: `${i}.jpg` }),
		);
		const s = run(actions);
		expect(s.captures).toHaveLength(SHELF_SCAN_CONSTANTS.MAX_CAPTURES);
		expect(atCaptureCap(s)).toBe(true);
	});

	it('ignores capture_taken outside capturing (e.g. a late shutter during processing)', () => {
		const s = run([{ type: 'capture_taken', uri: 'a.jpg' }, { type: 'finished' }]);
		expect(shelfScanReducer(s, { type: 'capture_taken', uri: 'late.jpg' })).toBe(s);
	});
});

describe('shelfScanReducer — interruption', () => {
	it('preserves captures across interrupt/resume', () => {
		const s = run([
			{ type: 'capture_taken', uri: 'a.jpg' },
			{ type: 'interrupted' },
			{ type: 'resumed' },
		]);
		expect(s.phase).toBe('capturing');
		expect(s.captures).toHaveLength(1);
	});

	it('lets in-flight OCR settle while interrupted', () => {
		const s = run([
			{ type: 'capture_taken', uri: 'a.jpg' },
			{ type: 'interrupted' },
			{ type: 'ocr_finished', uri: 'a.jpg', fragments: [{ text: 'A NEW DAWN' }] },
		]);
		expect(s.phase).toBe('interrupted');
		expect(s.fragments).toHaveLength(1);
	});

	it('ignores interrupted outside capturing (review survives backgrounding)', () => {
		const review = run([{ type: 'finished' }, { type: 'matched', matchCount: 2 }]);
		expect(shelfScanReducer(review, { type: 'interrupted' })).toBe(review);
	});
});

describe('shelfScanReducer — finish and matching', () => {
	it('Finish → processing → review when matches exist', () => {
		const s = run([
			{ type: 'capture_taken', uri: 'a.jpg' },
			{ type: 'ocr_finished', uri: 'a.jpg', fragments: [{ text: 'HEIR TO THE EMPIRE' }] },
			{ type: 'finished' },
			{ type: 'matched', matchCount: 1 },
		]);
		expect(s.phase).toBe('review');
	});

	it('Finish → processing → empty on zero matches', () => {
		const s = run([{ type: 'finished' }, { type: 'matched', matchCount: 0 }]);
		expect(s.phase).toBe('empty');
	});

	it('empty → continued resumes capturing with the session intact', () => {
		const s = run([
			{ type: 'capture_taken', uri: 'a.jpg' },
			{ type: 'ocr_finished', uri: 'a.jpg', fragments: [{ text: 'gibberish' }] },
			{ type: 'finished' },
			{ type: 'matched', matchCount: 0 },
			{ type: 'continued' },
		]);
		expect(s.phase).toBe('capturing');
		expect(s.fragments).toHaveLength(1); // keep scanning extends, not restarts
	});

	it('ignores matched outside processing (stale matcher result)', () => {
		expect(shelfScanReducer(initialShelfScanState, { type: 'matched', matchCount: 3 })).toBe(
			initialShelfScanState,
		);
	});
});

describe('shelfScanReducer — add flow', () => {
	const review = run([{ type: 'finished' }, { type: 'matched', matchCount: 2 }]);

	it('review → adding → done on success', () => {
		const s = run([{ type: 'add_started' }, { type: 'add_succeeded' }], review);
		expect(s.phase).toBe('done');
	});

	it('adding → review when blocked (offline keeps the draft)', () => {
		const s = run([{ type: 'add_started' }, { type: 'add_blocked' }], review);
		expect(s.phase).toBe('review');
	});

	it.each([
		['capturing', [{ type: 'capture_taken', uri: 'a.jpg' }] as ShelfScanAction[]],
		['processing', [{ type: 'finished' }] as ShelfScanAction[]],
		['empty', [{ type: 'finished' }, { type: 'matched', matchCount: 0 }] as ShelfScanAction[]],
		[
			'done',
			[
				{ type: 'finished' },
				{ type: 'matched', matchCount: 2 },
				{ type: 'add_started' },
				{ type: 'add_succeeded' },
			] as ShelfScanAction[],
		],
	])('reset returns to the initial state from %s', (_phase, setup) => {
		const s = run([...setup, { type: 'reset' }]);
		expect(s).toEqual(initialShelfScanState);
	});
});

// File ledger: pins WHEN each still becomes deletable. Expectations mirror the pre-ledger
// hook (settled non-ghost stills deleted; ghost kept while capturing may resume; never
// delete under an OCR read; released stills deleted once their OCR settles).
describe('shelfScanReducer — still file ledger', () => {
	const shot = (uri: string): ShelfScanAction[] => [
		{ type: 'still_saved', uri },
		{ type: 'capture_taken', uri },
	];
	const ocr = (uri: string): ShelfScanAction => ({ type: 'ocr_finished', uri, fragments: [] });

	it('keeps an OCR-pending still, retains the settled ghost, deletes older settled stills', () => {
		const pending = run(shot('a.jpg'));
		expect(pending.files).toEqual({ 'a.jpg': 'pending' });
		const s = run([ocr('a.jpg'), ...shot('b.jpg'), { type: 'ocr_failed', uri: 'b.jpg' }], pending);
		expect(s.files).toEqual({ 'a.jpg': 'deleted', 'b.jpg': 'retained' });
		expect(stillsToDelete(s.files)).toEqual(['a.jpg']);
	});

	it('deletes an older settled still while the newest is still OCR-pending', () => {
		const s = run([...shot('a.jpg'), ...shot('b.jpg'), ocr('a.jpg')]);
		expect(s.files).toEqual({ 'a.jpg': 'deleted', 'b.jpg': 'pending' });
	});

	it.each([
		['interrupted', [{ type: 'interrupted' }]],
		['processing', [{ type: 'finished' }]],
		['empty', [{ type: 'finished' }, { type: 'matched', matchCount: 0 }]],
	] as [string, ShelfScanAction[]][])('retains the ghost in %s', (phase, actions) => {
		const s = run([...shot('a.jpg'), ocr('a.jpg'), ...actions]);
		expect(s.phase).toBe(phase);
		expect(s.files).toEqual({ 'a.jpg': 'retained' });
	});

	it('deletes the ghost once capture is over (review), and never resurrects it', () => {
		const review = run([
			...shot('a.jpg'),
			ocr('a.jpg'),
			{ type: 'finished' },
			{ type: 'matched', matchCount: 1 },
		]);
		expect(review.files).toEqual({ 'a.jpg': 'deleted' });
		const acked = shelfScanReducer(review, { type: 'files_deleted', uris: ['a.jpg'] });
		expect(acked.files).toEqual({});
		expect(run([{ type: 'add_started' }, { type: 'add_blocked' }], acked).files).toEqual({});
	});

	it('reset deletes settled stills but waits for in-flight OCR before releasing the rest', () => {
		const s = run([...shot('a.jpg'), ocr('a.jpg'), ...shot('b.jpg'), { type: 'reset' }]);
		expect(s.captures).toEqual([]);
		expect(s.files).toEqual({ 'a.jpg': 'deleted', 'b.jpg': 'pending' });
		const settled = shelfScanReducer(s, ocr('b.jpg'));
		expect(settled.files).toEqual({ 'a.jpg': 'deleted', 'b.jpg': 'deleted' });
		expect(settled.fragments).toEqual([]); // a released still's text doesn't leak back in
	});

	it('releases a refused capture once its OCR settles (shutter landed after Finish)', () => {
		const s = run([{ type: 'finished' }, ...shot('late.jpg')]);
		expect(s.captures).toEqual([]);
		expect(s.files).toEqual({ 'late.jpg': 'pending' });
		expect(shelfScanReducer(s, { type: 'ocr_failed', uri: 'late.jpg' }).files).toEqual({
			'late.jpg': 'deleted',
		});
	});

	it('files_deleted only drops deleted entries', () => {
		const s = run([...shot('a.jpg')]);
		expect(shelfScanReducer(s, { type: 'files_deleted', uris: ['a.jpg', 'x.jpg'] })).toBe(s);
	});

	it('the unmount sweep skips OCR-pending stills (their continuation self-cleans)', () => {
		const s = run([
			...shot('a.jpg'),
			ocr('a.jpg'),
			...shot('b.jpg'),
			ocr('b.jpg'),
			...shot('c.jpg'),
		]);
		expect(s.files).toEqual({ 'a.jpg': 'deleted', 'b.jpg': 'deleted', 'c.jpg': 'pending' });
		const ghostRetained = run([...shot('d.jpg'), ocr('d.jpg')]);
		expect(stillsToDeleteOnUnmount(ghostRetained.files)).toEqual(['d.jpg']);
		expect(stillsToDeleteOnUnmount(s.files)).toEqual(['a.jpg', 'b.jpg']);
	});

	it('reset with no saved stills is exactly the initial state', () => {
		expect(shelfScanReducer(run(shot('a.jpg').slice(1)), { type: 'reset' })).toBe(
			initialShelfScanState,
		);
	});
});

describe('createCaptureGate', () => {
	const cfg = { steadyMaxMagnitude: 0.15, steadyHoldMs: 600, minIntervalMs: 1200 };

	it('fires after holding steady for steadyHoldMs', () => {
		const gate = createCaptureGate(cfg);
		expect(gate.sample(0.05, 0)).toBe(false); // steady starts
		expect(gate.sample(0.05, 300)).toBe(false); // not held long enough
		expect(gate.sample(0.05, 600)).toBe(true); // held 600ms → fire
	});

	it('does not fire while moving, and restarts the hold after movement', () => {
		const gate = createCaptureGate(cfg);
		expect(gate.sample(0.5, 0)).toBe(false); // panning
		expect(gate.sample(0.05, 100)).toBe(false); // steady starts at 100
		expect(gate.sample(0.5, 400)).toBe(false); // moved — hold resets
		expect(gate.sample(0.05, 500)).toBe(false); // steady restarts at 500
		expect(gate.sample(0.05, 1000)).toBe(false); // only 500ms held
		expect(gate.sample(0.05, 1100)).toBe(true); // 600ms held → fire
	});

	it('never double-fires while holding perfectly still (requires movement between captures)', () => {
		const gate = createCaptureGate(cfg);
		expect(gate.sample(0.05, 0)).toBe(false);
		expect(gate.sample(0.05, 600)).toBe(true); // first capture
		// Still steady long past hold + interval — must NOT fire again.
		expect(gate.sample(0.05, 1300)).toBe(false);
		expect(gate.sample(0.05, 5000)).toBe(false);
		// Pan to the next shelf section, settle again → fires.
		expect(gate.sample(0.6, 5100)).toBe(false);
		expect(gate.sample(0.05, 5200)).toBe(false);
		expect(gate.sample(0.05, 5800)).toBe(true);
	});

	it('enforces the minimum interval even across movement', () => {
		const gate = createCaptureGate(cfg);
		expect(gate.sample(0.05, 0)).toBe(false);
		expect(gate.sample(0.05, 600)).toBe(true); // fire at 600
		expect(gate.sample(0.6, 700)).toBe(false); // moved
		expect(gate.sample(0.05, 800)).toBe(false); // steady again at 800
		expect(gate.sample(0.05, 1400)).toBe(false); // held 600ms, but only 800ms since fire
		expect(gate.sample(0.05, 1900)).toBe(true); // interval elapsed → fire
	});

	it('reset() clears steadiness/movement history but KEEPS the fire interval', () => {
		const gate = createCaptureGate(cfg);
		expect(gate.sample(0.05, 0)).toBe(false);
		expect(gate.sample(0.05, 600)).toBe(true); // fire at 600
		gate.reset(); // e.g. resume from interruption
		// No movement required after reset, but the hold restarts…
		expect(gate.sample(0.05, 700)).toBe(false);
		// …and the min interval since the last fire still applies (a reset must not
		// become a way to fire twice in quick succession).
		expect(gate.sample(0.05, 1300)).toBe(false); // held 600ms, but only 700ms since fire
		expect(gate.sample(0.05, 1800)).toBe(true); // interval elapsed → fire
	});

	it('reset(true) requires movement before the first fire (cold start of the loop)', () => {
		const gate = createCaptureGate(cfg);
		gate.reset(true); // intro dismissed / "keep scanning" — phone may face a lap
		// Holding dead still must NOT fire: a phantom photo of whatever it faces.
		expect(gate.sample(0.05, 0)).toBe(false);
		expect(gate.sample(0.05, 600)).toBe(false);
		expect(gate.sample(0.05, 5000)).toBe(false);
		// Raise the phone into framing (movement), then settle → now it fires.
		expect(gate.sample(0.6, 5100)).toBe(false);
		expect(gate.sample(0.05, 5200)).toBe(false);
		expect(gate.sample(0.05, 5800)).toBe(true);
	});
});

describe('deriveShelfChrome', () => {
	it.each([
		['capturing', 0, { immersive: false, dirty: false }], // pristine — nothing to lose
		['capturing', 3, { immersive: false, dirty: true }], // captures pending
		['interrupted', 2, { immersive: false, dirty: true }],
		['processing', 4, { immersive: false, dirty: true }],
		['empty', 2, { immersive: false, dirty: true }],
		['review', 0, { immersive: true, dirty: true }], // resumed draft, no captures
		['adding', 5, { immersive: true, dirty: true }],
		['done', 5, { immersive: true, dirty: false }], // already saved
	] as const)('phase=%s captures=%d → %o', (phase, count, expected) => {
		expect(deriveShelfChrome(phase, count)).toEqual(expected);
	});
});
