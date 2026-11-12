import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { driftChip } from '../../admin/lib/drift-chip';

// #319: the catalog drift chip read "Matches backup" whenever the drift check
// failed, and a backup read or parse throw rejected the whole catalog page.

const state = vi.hoisted(() => ({
	safeRead: vi.fn(async (_rel: string): Promise<string | null> => null),
	parseThrows: false,
}));

vi.mock('../../admin/lib/auth', () => ({ getAdmin: async () => ({ id: 'admin' }) }));
vi.mock('../../admin/lib/admin-allowlist', () => ({ IS_HOSTED: false }));
vi.mock('../../admin/lib/safe-fs', () => ({
	DataDirUnavailableError: class extends Error {},
	safeRead: state.safeRead,
	safeWrite: async () => {},
}));
vi.mock('../../admin/lib/supabase-admin', () => ({
	getDbTarget: async () => 'local',
	getSupabaseAdmin: async () => ({
		from: () => ({ select: async () => ({ data: [], error: null }) }),
	}),
}));
vi.mock('../csv/read', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../csv/read')>();
	return {
		...actual,
		parseCsv: (text: string) => {
			if (state.parseThrows) throw new Error('Unclosed quote at /secret/path');
			return actual.parseCsv(text);
		},
	};
});
// Root has no `next`. Bare id covers CI (no admin deps); the path covers a
// local run where admin's install resolves it.
const nextCache = { revalidatePath: () => {}, revalidateTag: () => {} };
vi.mock('next/cache', () => nextCache);
vi.mock('../../admin/node_modules/next/cache.js', () => nextCache);

type Res = { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } };
// Non-literal path keeps export.ts out of the root typecheck (its `@app/*`
// aliases only resolve under admin/tsconfig.json).
const exportPath = resolve(__dirname, '../../admin/app/_actions/export.ts');
const loadExport = async () =>
	(await import(/* @vite-ignore */ exportPath)) as { getDriftReport: () => Promise<Res> };

const adminSource = (rel: string) => {
	const p = resolve(__dirname, '../../admin', rel);
	return existsSync(p) ? readFileSync(p, 'utf-8') : '';
};

const ok = (rows: number) => ({ ok: true as const, data: { summary: { rows } } });
const failed = (message: string) => ({ ok: false as const, error: { code: 'NO_BACKUP', message } });

describe('driftChip (#319)', () => {
	it('hosted (no report) shows no chip', () => {
		expect(driftChip(null)).toBeNull();
	});

	it('ok with 0 rows reads "Matches backup"', () => {
		expect(driftChip(ok(0))).toMatchObject({ label: 'Matches backup', tone: 'clean' });
	});

	it('ok with 3 rows reads "3 unsaved"', () => {
		expect(driftChip(ok(3))).toMatchObject({ label: '3 unsaved', tone: 'unsaved' });
	});

	it('a failed report reads "Drift unavailable", never "Matches backup"', () => {
		const chip = driftChip(failed('data/catalog-backup.csv is missing.'));
		expect(chip).toMatchObject({
			label: 'Drift unavailable',
			tone: 'error',
			title: 'data/catalog-backup.csv is missing.',
		});
		expect(chip?.label).not.toBe('Matches backup');
	});
});

describe('getDriftReport resolves on backup read or parse errors (#319)', () => {
	beforeEach(() => {
		state.safeRead.mockReset();
		state.safeRead.mockResolvedValue('slug,title\na-book,A Book\n');
		state.parseThrows = false;
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const expectBackupRead = (res: Res | 'rejected') => {
		expect(res).not.toBe('rejected');
		expect(res).toMatchObject({ ok: false, error: { code: 'BACKUP_READ' } });
		const message = (res as Extract<Res, { ok: false }>).error.message;
		expect(message).toContain('catalog-backup.csv');
		expect(message).not.toContain('/secret/path');
		expect(console.error).toHaveBeenCalled();
	};

	it('a non-ENOENT read error (EACCES) resolves { ok: false }', async () => {
		state.safeRead.mockRejectedValue(
			Object.assign(new Error('EACCES: permission denied, open /secret/path'), { code: 'EACCES' }),
		);
		const { getDriftReport } = await loadExport();
		expectBackupRead(await getDriftReport().catch(() => 'rejected' as const));
	});

	it('a parseCsv throw resolves { ok: false }', async () => {
		state.parseThrows = true;
		const { getDriftReport } = await loadExport();
		expectBackupRead(await getDriftReport().catch(() => 'rejected' as const));
	});

	it('a readable backup still resolves ok', async () => {
		const { getDriftReport } = await loadExport();
		await expect(getDriftReport()).resolves.toMatchObject({ ok: true });
	});
});

describe('the catalog page renders the chip through driftChip (#319)', () => {
	const src = adminSource('app/admin/books/page.tsx');

	it('imports and calls the helper on the drift report', () => {
		expect(src).toMatch(/import\s*\{[^}]*\bdriftChip\b[^}]*\}\s*from\s*'@\/lib\/drift-chip'/);
		expect(src).toMatch(/driftChip\(\s*drift\s*\)/);
	});

	it('has no inline "Matches backup" fallback left', () => {
		expect(src).not.toContain('Matches backup');
		expect(src).not.toMatch(/drift\?\.ok\s*\?/);
	});

	it('links the chip to /admin/diff with the error as its title', () => {
		expect(src).toMatch(/href="\/admin\/diff"/);
		expect(src).toMatch(/title=\{\s*chip\.title\s*\}/);
	});
});
