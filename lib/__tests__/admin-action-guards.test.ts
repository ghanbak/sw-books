import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// #213: server action call sites #210 missed, plus the pin file write and the
// DB target switch result. Drives the real admin actions; only I/O is mocked.

const state = vi.hoisted(() => ({
	admin: { id: 'admin' } as { id: string } | null,
	writePins: vi.fn(async (_pins: unknown): Promise<void> => {}),
	cookieSets: [] as unknown[][],
	bookRows: [] as Record<string, unknown>[],
	safeWrite: vi.fn(async (_rel: string, _contents: string): Promise<void> => {}),
	revalidateTag: vi.fn((_tag: string) => {}),
}));

vi.mock('../../admin/lib/auth', () => ({ getAdmin: async () => state.admin }));
vi.mock('../../admin/lib/enrichment', () => ({
	PINS_WRITABLE: true,
	WIKI_INFO_TAG: 'wiki-info',
	loadPins: async () => ({
		available: true,
		pins: new Map([['old-book', { pageid: 7, title: 'Old', pinned_at: '2026-11-01T00:00:00Z' }]]),
		errors: [],
	}),
	writePins: state.writePins,
}));
vi.mock('../../admin/lib/admin-allowlist', () => ({ IS_HOSTED: false }));
vi.mock('../../admin/lib/safe-fs', () => ({
	DataDirUnavailableError: class extends Error {},
	safeRead: async () => null,
	safeWrite: state.safeWrite,
}));
vi.mock('../../admin/lib/supabase-admin', () => ({
	DB_TARGET_COOKIE: 'admin-db-target',
	getDbTarget: async () => 'prod',
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
			q.then = (done: unknown) =>
				(done as (r: unknown) => unknown)({ data: state.bookRows, error: null });
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
// Root has no `next`. Bare ids cover CI (no admin deps, imports stay
// unresolved); the paths cover a local run where admin's install resolves them.
const nextCache = { revalidatePath: () => {}, revalidateTag: state.revalidateTag };
const nextHeaders = {
	cookies: async () => ({ set: (...args: unknown[]) => state.cookieSets.push(args) }),
};
vi.mock('next/cache', () => nextCache);
vi.mock('../../admin/node_modules/next/cache.js', () => nextCache);
vi.mock('next/headers', () => nextHeaders);
vi.mock('../../admin/node_modules/next/headers.js', () => nextHeaders);

type Res = { ok: boolean; error?: { code: string; message: string } };
// Non-literal paths keep the admin files out of the root typecheck (their
// `@app/*` aliases only resolve under admin/tsconfig.json).
const enrichmentPath = resolve(__dirname, '../../admin/app/_actions/enrichment.ts');
const dbTargetPath = resolve(__dirname, '../../admin/app/_actions/db-target.ts');
const exportPath = resolve(__dirname, '../../admin/app/_actions/export.ts');
type Enrichment = {
	savePin: (raw: unknown) => Promise<Res>;
	removePin: (slug: string) => Promise<Res>;
};
type DbTargetActions = { setDbTarget: (target: string) => Promise<Res | undefined> };
const loadEnrichment = async () => (await import(/* @vite-ignore */ enrichmentPath)) as Enrichment;
const loadDbTarget = async () => (await import(/* @vite-ignore */ dbTargetPath)) as DbTargetActions;
type ExportActions = { exportToCsv: () => Promise<Res> };
const loadExport = async () => (await import(/* @vite-ignore */ exportPath)) as ExportActions;

const source = (path: string) => readFileSync(resolve(__dirname, '../../admin', path), 'utf-8');

beforeEach(() => {
	state.admin = { id: 'admin' };
	state.cookieSets.length = 0;
	state.writePins.mockReset();
	state.writePins.mockResolvedValue(undefined);
	state.bookRows = [];
	state.safeWrite.mockReset();
	state.safeWrite.mockResolvedValue(undefined);
	state.revalidateTag.mockClear();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe('a failed pin file write returns its own failure (#213)', () => {
	const diskFull = () => state.writePins.mockRejectedValue(new Error('ENOSPC: /secret/path'));

	const expectPinWriteFailure = (res: Res) => {
		expect(res).toMatchObject({ ok: false, error: { code: 'PINS_WRITE' } });
		expect(res.error?.message).toContain('enrichment-pins.json');
		expect(res.error?.message).not.toContain('request did not complete');
		expect(res.error?.message).not.toContain('/secret/path');
	};

	it('savePin resolves to a pin file failure', async () => {
		diskFull();
		const { savePin } = await loadEnrichment();
		const res = await savePin({ slug: 'new-book', pageid: 42 }).catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		expectPinWriteFailure(res as Res);
	});

	it('removePin resolves to a pin file failure', async () => {
		diskFull();
		const { removePin } = await loadEnrichment();
		const res = await removePin('old-book').catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		expectPinWriteFailure(res as Res);
	});

	it('both still succeed when the write succeeds', async () => {
		const { savePin, removePin } = await loadEnrichment();
		await expect(savePin({ slug: 'new-book', pageid: 42 })).resolves.toMatchObject({ ok: true });
		await expect(removePin('old-book')).resolves.toMatchObject({ ok: true });
		expect(state.writePins).toHaveBeenCalledTimes(2);
	});
});

describe('a failed backup file write returns its own failure (#280)', () => {
	beforeEach(() => {
		state.bookRows = [{ id: 'b1', slug: 'a-book', title: 'A Book' }];
	});

	it('exportToCsv resolves to a backup file failure and skips revalidation', async () => {
		state.safeWrite.mockRejectedValue(new Error('ENOSPC: /secret/path'));
		const { exportToCsv } = await loadExport();
		const res = await exportToCsv().catch(() => 'rejected' as const);
		expect(res).not.toBe('rejected');
		expect(res).toMatchObject({ ok: false, error: { code: 'BACKUP_WRITE' } });
		const message = (res as Res).error?.message ?? '';
		expect(message).toContain('catalog-backup.csv');
		expect(message).not.toContain('/secret/path');
		expect(message).not.toContain('ENOSPC');
		expect(message).not.toContain('request did not complete');
		expect(state.revalidateTag).not.toHaveBeenCalled();
		expect(console.error).toHaveBeenCalled();
	});

	it('exportToCsv still succeeds and revalidates when the write succeeds', async () => {
		const { exportToCsv } = await loadExport();
		await expect(exportToCsv()).resolves.toMatchObject({ ok: true, data: { rows: 1 } });
		expect(state.safeWrite).toHaveBeenCalledTimes(1);
		expect(state.safeWrite.mock.calls[0]?.[0]).toBe('catalog-backup.csv');
		expect(state.revalidateTag).toHaveBeenCalledWith('books');
	});
});

describe('setDbTarget returns a result (#213)', () => {
	it('succeeds and sets the cookie', async () => {
		const { setDbTarget } = await loadDbTarget();
		await expect(setDbTarget('prod')).resolves.toEqual({ ok: true });
		expect(state.cookieSets).toHaveLength(1);
		expect(state.cookieSets[0]?.slice(0, 2)).toEqual(['admin-db-target', 'prod']);
	});

	it('returns a failure when not an admin', async () => {
		state.admin = null;
		const { setDbTarget } = await loadDbTarget();
		await expect(setDbTarget('prod')).resolves.toMatchObject({
			ok: false,
			error: { code: 'AUTH' },
		});
		expect(state.cookieSets).toHaveLength(0);
	});

	it('returns a failure for an unknown target', async () => {
		const { setDbTarget } = await loadDbTarget();
		await expect(setDbTarget('staging')).resolves.toMatchObject({
			ok: false,
			error: { code: 'INVALID' },
		});
		expect(state.cookieSets).toHaveLength(0);
	});
});

describe('call sites guard their server actions (#213)', () => {
	const sites: Array<[file: string, actions: string[]]> = [
		['app/admin/books/new/_components/new-book-form.tsx', ['searchForNewBook', 'createBook']],
		['app/admin/books/_components/db-target-switch.tsx', ['setDbTarget']],
	];

	for (const [file, actions] of sites) {
		const src = source(file);
		for (const action of actions) {
			it(`${action} in ${file} goes through callAction`, () => {
				expect(src).toMatch(/import\s*\{\s*callAction\s*\}\s*from\s*'@\/lib\/call-action'/);
				expect(src).toMatch(new RegExp(`callAction\\(\\s*\\(\\)\\s*=>\\s*${action}\\(`));
				expect(src).not.toMatch(new RegExp(`await\\s+${action}\\(`));
			});
		}
	}

	it('the DB switch toasts a failure and only refreshes on success', () => {
		const src = source('app/admin/books/_components/db-target-switch.tsx');
		const body = src.match(/function toggle\([\s\S]*?\n\t\}/)?.[0] ?? '';
		const failure = body.search(/if\s*\(\s*!res\.ok\s*\)\s*\{\s*toast\.error\(/);
		expect(failure).toBeGreaterThan(-1);
		const refresh = body.indexOf('router.refresh()');
		expect(refresh).toBeGreaterThan(failure);
		expect(body.slice(failure, refresh)).toMatch(/return;/);
	});
});
