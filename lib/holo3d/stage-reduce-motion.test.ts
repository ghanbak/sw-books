import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #276: under Reduce Motion the stage redraws only when something changed. A cover texture that
 * lands after the first frame must still reach the screen. The GPU runtime (three/webgpu,
 * react-native-webgpu) can't load under node, so gpu/scene/textures are mocked and the frame
 * loop is driven by hand. Each `render()` records the cover the card held at draw time.
 */

type Cover = { texture: { id: string }; dispose: () => void };

const h = vi.hoisted(() => {
	const state = {
		frame: null as ((time: number) => void) | null,
		decodes: [] as { uri: string; resolve: (bitmap: { close: () => void }) => void }[],
		cards: [] as { cover: unknown }[],
		draws: [] as unknown[][],
		gravityReads: 0,
		clock: null as Record<string, { value: number }> | null,
		motes: null as { visible: boolean } | null,
	};
	return { state };
});

vi.mock('./runtime/gpu', () => ({
	createHoloRenderer: () => ({
		init: async () => {},
		compileAsync: async () => {},
		setAnimationLoop: async (fn: ((time: number) => void) | null) => {
			h.state.frame = fn;
		},
	}),
	disposeHoloRenderer: () => {},
}));

vi.mock('./runtime/scene', () => ({
	buildHoloScene: (_renderer: unknown, opts: { cardCount: number }) => {
		const vec = () => ({ x: 0, y: 0, z: 0, setScalar: () => {} });
		const float = () => ({ value: 0 });
		const cards = Array.from({ length: opts.cardCount }, () => {
			const record = { cover: null as unknown };
			h.state.cards.push(record);
			return {
				mesh: { visible: true, rotation: vec(), position: vec(), scale: vec() },
				setCover: (cover: unknown) => {
					record.cover = cover;
				},
				setFallbackColor: () => {},
				setFade: () => {},
				setPressed: () => {},
				setFringe: () => {},
			};
		});
		const clock = {
			time: float(),
			flicker: float(),
			band: float(),
			bandStrength: float(),
			fringeOn: float(),
		};
		// Matches buildHoloScene's still defaults (motes hidden, fringe off until a motion frame).
		const motes = { visible: false };
		h.state.clock = clock;
		h.state.motes = motes;
		return {
			cards,
			projector: { scale: vec(), position: vec() },
			motes,
			clock,
			pipeline: {
				render: () => {
					h.state.draws.push(h.state.cards.map((card) => card.cover));
				},
			},
			dispose: () => {},
		};
	},
}));

vi.mock('./runtime/textures', () => ({
	decodeCover: (uri: string) =>
		new Promise((resolve) => {
			h.state.decodes.push({ uri, resolve });
		}),
	uploadCover: (_renderer: unknown, bitmap: { id: string }): Cover => ({
		texture: { id: `cover:${bitmap.id}` },
		dispose: () => {},
	}),
	makeStarfieldTexture: (seed: string): Cover => ({
		texture: { id: `sky:${seed}` },
		dispose: () => {},
	}),
}));

import { type StageBook, createHoloStage } from './runtime/stage';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const book = (key: string): StageBook => ({
	key,
	coverUri: `https://covers.test/${key}.jpg`,
	fallbackColor: '#1a3a5c',
	skySeed: key,
});

let clock = 0;
/** Run `count` animation frames, 16 ms apart. */
function runFrames(count: number) {
	for (let i = 0; i < count; i++) {
		clock += 16;
		h.state.frame?.(clock);
	}
}

async function makeStage(mode: 'single' | 'pager', books: StageBook[]) {
	const stage = createHoloStage({
		context: { canvas: { width: 0, height: 0 }, present: () => {} } as never,
		device: { queue: { onSubmittedWorkDone: async () => {} }, destroy: () => {} } as never,
		mode,
		width: 390,
		height: 520,
		pixelRatio: 3,
		cardWidth: 200,
		pageWidth: 390,
		getScrollX: () => 0,
		getGravity: () => {
			h.state.gravityReads += 1;
			return { x: 3, y: 2, z: -9 };
		},
	});
	stage.setReduceMotion(true);
	stage.setBooks(books);
	await flush(); // init + compile resolve, setAnimationLoop captures the frame callback
	await flush();
	return stage;
}

/** Resolve the pending decode for `uri` and let its `.then` queue the bitmap. */
async function deliverCover(key: string) {
	const pending = h.state.decodes.find((d) => d.uri.endsWith(`/${key}.jpg`));
	pending?.resolve({ id: key, close: () => {} } as never);
	await flush();
}

const coverId = (cover: unknown) => (cover as { id?: string } | null)?.id ?? null;
const lastDraw = () => h.state.draws.at(-1) ?? [];

describe('holo stage under Reduce Motion (#276)', () => {
	beforeEach(() => {
		clock = 1000;
		vi.spyOn(performance, 'now').mockImplementation(() => clock);
		h.state.frame = null;
		h.state.decodes = [];
		h.state.cards = [];
		h.state.draws = [];
		h.state.gravityReads = 0;
		h.state.clock = null;
		h.state.motes = null;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('detail hero: draws the cover once a late texture is uploaded', async () => {
		const stage = await makeStage('single', [book('lotj')]);
		expect(h.state.frame).toBeTypeOf('function');
		// Ready timeout passes with the cover still decoding: the stage settles on the tint.
		runFrames(120);
		expect(coverId(lastDraw()[0])).toBeNull();

		await deliverCover('lotj');
		runFrames(4);
		expect(coverId(lastDraw()[0])).toBe('cover:lotj');
		stage.dispose();
	});

	it('detail hero: draws the cover when it lands before the first settle', async () => {
		const stage = await makeStage('single', [book('lotj')]);
		runFrames(2);
		await deliverCover('lotj');
		runFrames(4);
		expect(coverId(lastDraw()[0])).toBe('cover:lotj');
		stage.dispose();
	});

	it('stays a still frame: no redraws, no gyro reads once settled', async () => {
		const stage = await makeStage('single', [book('lotj')]);
		runFrames(2);
		await deliverCover('lotj');
		runFrames(4);
		const draws = h.state.draws.length;
		runFrames(60);
		expect(h.state.draws.length).toBe(draws);
		expect(h.state.gravityReads).toBe(0);
		// Look extras frozen: clock never advances; motes and fringe off.
		expect(h.state.clock?.time.value).toBe(0);
		expect(h.state.clock?.fringeOn.value).toBe(0);
		expect(h.state.motes?.visible).toBe(false);
		stage.dispose();
	});

	it('timeline pager: a lone upload (no neighbour to force a redraw) still draws', async () => {
		const stage = await makeStage('pager', [book('a')]);
		runFrames(2);
		await deliverCover('a');
		runFrames(30);
		expect(lastDraw().map(coverId)).toContain('cover:a');
		stage.dispose();
	});

	it('timeline pager: the active cover still draws', async () => {
		const stage = await makeStage('pager', [book('a'), book('b'), book('c')]);
		runFrames(2);
		await deliverCover('a');
		await deliverCover('b');
		// Uploads wait for the pager to settle (150 ms with no scroll change).
		runFrames(30);
		const active = lastDraw().map(coverId);
		expect(active).toContain('cover:a');
		expect(h.state.gravityReads).toBe(0);
		stage.dispose();
	});
});
