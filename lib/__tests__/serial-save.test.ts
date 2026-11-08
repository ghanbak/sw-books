import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSaveGate, serializeSave } from '../serial-save';

type Res = { ok: boolean };

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const isOk = (r: Res) => r.ok;

describe('serializeSave (#172)', () => {
	it('a fast double click sends one request', async () => {
		const gate = createSaveGate();
		const d = deferred<Res>();
		const send = vi.fn(() => d.promise);
		const first = serializeSave(gate, send, isOk);
		const second = serializeSave(gate, send, isOk);
		d.resolve({ ok: true });
		expect(await first).toEqual({ ok: true });
		expect(await second).toBeUndefined();
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('stays locked after a success until the form remounts (refresh lands)', async () => {
		const gate = createSaveGate();
		const send = vi.fn(async () => ({ ok: true }));
		await serializeSave(gate, send, isOk);
		// The gap between save resolving and router.refresh() remounting the form.
		expect(await serializeSave(gate, send, isOk)).toBeUndefined();
		expect(send).toHaveBeenCalledTimes(1);
		expect(gate.held).toBe(true);
	});

	it('releases after a failed or thrown save so the user can retry', async () => {
		const gate = createSaveGate();
		await serializeSave(gate, async () => ({ ok: false }), isOk);
		expect(gate.held).toBe(false);
		await expect(
			serializeSave(
				gate,
				async () => {
					throw new Error('network');
				},
				isOk,
			),
		).rejects.toThrow('network');
		expect(gate.held).toBe(false);
		const send = vi.fn(async () => ({ ok: true }));
		await serializeSave(gate, send, isOk);
		expect(send).toHaveBeenCalledTimes(1);
	});
});

describe('manual edit form wiring (#172)', () => {
	const src = readFileSync(
		resolve(__dirname, '../../admin/app/admin/books/[slug]/_components/manual-fields-form.tsx'),
		'utf8',
	);

	it('sends patchBook through the save gate', () => {
		expect(src).toMatch(/from '@app\/serial-save'/);
		expect(src).toMatch(/useState\(createSaveGate\)/);
		expect(src).toMatch(/serializeSave\(\s*gate,\s*\(\)\s*=>\s*patchBook\(/);
	});

	it('does not tie the disabled state to the save transition alone', () => {
		// useTransition's isPending clears when patchBook resolves, before
		// router.refresh() lands — the window that re-enabled Save.
		expect(src).not.toMatch(/const \[saving, startSave\] = useTransition\(\)/);
	});
});
