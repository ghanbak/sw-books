import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// #280: a failed write must not leave data/<file>.<pid>.tmp behind.
// Drives the real safeWrite against a temp data/ dir.

// `server-only` throws outside a react-server build. Bare id for CI (root
// install), path for a local run where admin's install resolves it.
vi.mock('server-only', () => ({}));
vi.mock('../../admin/node_modules/server-only/index.js', () => ({}));

type SafeFs = { safeWrite: (rel: string, contents: string) => Promise<void> };
// Non-literal path keeps the admin file out of the root typecheck.
const safeFsPath = resolve(__dirname, '../../admin/lib/safe-fs.ts');
const loadSafeFs = async () => (await import(/* @vite-ignore */ safeFsPath)) as SafeFs;

let root: string;
let data: string;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), 'safe-fs-'));
	data = join(root, 'data');
	mkdirSync(data);
	mkdirSync(join(root, 'admin'));
	// safeWrite resolves data/ as `<cwd>/../data`.
	vi.spyOn(process, 'cwd').mockReturnValue(join(root, 'admin'));
});
afterAll(() => {
	vi.restoreAllMocks();
	rmSync(root, { recursive: true, force: true });
});

const tmpFiles = () => readdirSync(data).filter((f) => f.endsWith('.tmp'));

describe('safeWrite tmp-file cleanup (#280)', () => {
	it('writes the file and leaves no tmp on success', async () => {
		const { safeWrite } = await loadSafeFs();
		await safeWrite('ok.csv', 'a,b\n');
		expect(readFileSync(join(data, 'ok.csv'), 'utf-8')).toBe('a,b\n');
		expect(tmpFiles()).toEqual([]);
	});

	it('removes the tmp and rethrows when the rename fails', async () => {
		// A non-empty directory at the target makes rename(file, target) fail.
		mkdirSync(join(data, 'blocked.csv'));
		writeFileSync(join(data, 'blocked.csv', 'keep'), '');
		const { safeWrite } = await loadSafeFs();
		const err = await safeWrite('blocked.csv', 'x').catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as NodeJS.ErrnoException).code).toMatch(/^E[A-Z]+$/);
		expect(tmpFiles()).toEqual([]);
	});
});
