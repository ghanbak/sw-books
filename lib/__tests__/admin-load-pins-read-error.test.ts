import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// #329: a pins file that exists but can't be read (EISDIR here, EACCES in the
// wild) must not reject loadPins(), the catalog/book pages, or the pin actions.
// Drives the real loadPins + safeRead against a temp data/ dir.

// `server-only` throws outside a react-server build. Bare ids for CI (root
// install only), paths for a local run where admin's install resolves them.
vi.mock('server-only', () => ({}));
vi.mock('../../admin/node_modules/server-only/index.js', () => ({}));
const nextCache = {
	unstable_cache: <T>(fn: T) => fn,
	revalidatePath: () => {},
	revalidateTag: () => {},
};
vi.mock('next/cache', () => nextCache);
vi.mock('../../admin/node_modules/next/cache.js', () => nextCache);

vi.mock('../../admin/lib/auth', () => ({ getAdmin: async () => ({ id: 'admin' }) }));
vi.mock('../../admin/lib/supabase-admin', () => ({
	getSupabaseAdmin: async () => ({
		from: () => {
			const q: Record<string, (...args: unknown[]) => unknown> = {};
			for (const op of ['select', 'eq', 'in']) q[op] = () => q;
			q.maybeSingle = async () => ({
				data: { id: 'b1', slug: 'new-book', book_enrichment: null },
				error: null,
			});
			// `owners()` awaits the builder itself.
			// biome-ignore lint/suspicious/noThenProperty: fake postgrest builder is thenable
			q.then = (done: unknown) => (done as (r: unknown) => unknown)({ data: [], error: null });
			return q;
		},
	}),
}));
vi.mock('../wookieepedia/client', () => ({
	fetchPageInfo: async () => new Map(),
	searchPages: async () => [],
	fetchPagesByIds: async (ids: number[]) =>
		ids.map((pageid) => ({ status: 'ok', page: { pageid, title: 'New Book', wikitext: '' } })),
}));
vi.mock('../wookieepedia/appearances', () => ({
	parsePageEnrichment: () => ({
		hasBookInfobox: true,
		diagnostics: { appTemplates: 0 },
		entryCount: 3,
		timeline_notes: null,
	}),
}));

type PinsLoad = { available: boolean; pins: Map<string, unknown>; errors: string[] };
type Res = { ok: boolean; error?: { code: string; message: string } };
type EnrichmentLib = { loadPins: () => Promise<PinsLoad> };
type EnrichmentActions = {
	savePin: (raw: unknown) => Promise<Res>;
	removePin: (slug: string) => Promise<Res>;
};
// Non-literal paths keep the admin files out of the root typecheck.
const libPath = resolve(__dirname, '../../admin/lib/enrichment.ts');
const actionsPath = resolve(__dirname, '../../admin/app/_actions/enrichment.ts');
const loadLib = async () => (await import(/* @vite-ignore */ libPath)) as EnrichmentLib;
const loadActions = async () => (await import(/* @vite-ignore */ actionsPath)) as EnrichmentActions;

const REASON = 'could not read data/enrichment-pins.json (see server log)';

let root: string;
let rootReal: string;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'load-pins-'));
	rootReal = realpathSync(root);
	// A directory where the file should be: readFile rejects with EISDIR.
	mkdirSync(join(root, 'data', 'enrichment-pins.json'), { recursive: true });
	mkdirSync(join(root, 'admin'));
	// safeRead resolves data/ as `<cwd>/../data`.
	vi.spyOn(process, 'cwd').mockReturnValue(join(root, 'admin'));
});
afterAll(() => {
	vi.restoreAllMocks();
	rmSync(root, { recursive: true, force: true });
});
beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const expectNoPath = (text: string) => {
	expect(text).not.toContain(root);
	expect(text).not.toContain(rootReal);
	expect(text).not.toContain('EISDIR');
};

describe('an unreadable pins file (#329)', () => {
	it('loadPins resolves with an empty map and one path-free error', async () => {
		const { loadPins } = await loadLib();
		const res = await loadPins().catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		const loaded = res as PinsLoad;
		expect(loaded.available).toBe(true);
		expect(loaded.pins.size).toBe(0);
		expect(loaded.errors).toEqual([REASON]);
		expectNoPath(loaded.errors[0] ?? '');
		expect(console.error).toHaveBeenCalledWith('[admin:loadPins]', expect.any(Error));
	});

	it('savePin returns PINS_INVALID with that reason', async () => {
		const { savePin } = await loadActions();
		const res = await savePin({ slug: 'new-book', pageid: 42 }).catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		expect(res).toMatchObject({ ok: false, error: { code: 'PINS_INVALID' } });
		const message = (res as Res).error?.message ?? '';
		expect(message).toContain(REASON);
		expectNoPath(message);
	});

	it('removePin returns PINS_INVALID with that reason', async () => {
		const { removePin } = await loadActions();
		const res = await removePin('old-book').catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		expect(res).toMatchObject({ ok: false, error: { code: 'PINS_INVALID' } });
		const message = (res as Res).error?.message ?? '';
		expect(message).toContain(REASON);
		expectNoPath(message);
	});
});
