import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createRowSaveQueue, createSaveGate, queueRowSave, serializeSave } from '../serial-save';

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

type Saved = { ok: true; at: string } | { ok: false };
const savedAt = (r: Saved) => (r.ok ? r.at : undefined);

describe('queueRowSave (#184)', () => {
	it("a second edit on the same row waits and sends the first save's updated_at", async () => {
		const queue = createRowSaveQueue();
		const d = deferred<Saved>();
		const send = vi.fn(
			(at: string | null): Promise<Saved> =>
				at === 't0' ? d.promise : Promise.resolve({ ok: true, at: 't2' }),
		);
		const first = queueRowSave(queue, 'a', 't0', send, savedAt);
		const second = queueRowSave(queue, 'a', 't0', send, savedAt);
		await Promise.resolve();
		expect(send).toHaveBeenCalledTimes(1);
		d.resolve({ ok: true, at: 't1' });
		await first;
		await second;
		expect(send.mock.calls.map((c) => c[0])).toEqual(['t0', 't1']);
	});

	it("does not chain across rows, and drains so the next edit uses the caller's value", async () => {
		const queue = createRowSaveQueue();
		const d = deferred<Saved>();
		const send = vi.fn((_at: string | null): Promise<Saved> => d.promise);
		void queueRowSave(queue, 'a', 'a0', send, savedAt);
		void queueRowSave(queue, 'b', 'b0', send, savedAt);
		await Promise.resolve();
		expect(send.mock.calls.map((c) => c[0])).toEqual(['a0', 'b0']);
		d.resolve({ ok: true, at: 'x1' });
		await new Promise((r) => setTimeout(r, 0));
		expect(queue.size).toBe(0);
		const later = vi.fn(async (_at: string | null): Promise<Saved> => ({ ok: true, at: 'x2' }));
		await queueRowSave(queue, 'a', 'fresh', later, savedAt);
		expect(later).toHaveBeenCalledWith('fresh');
	});

	it('a failed or thrown save keeps the chain going with the last good updated_at', async () => {
		const queue = createRowSaveQueue();
		const thrown = queueRowSave(
			queue,
			'a',
			't0',
			async () => {
				throw new Error('network');
			},
			savedAt,
		);
		const failed = queueRowSave(
			queue,
			'a',
			't0',
			async (): Promise<Saved> => ({ ok: false }),
			savedAt,
		);
		const next = vi.fn(async (_at: string | null): Promise<Saved> => ({ ok: true, at: 't1' }));
		const third = queueRowSave(queue, 'a', 't0', next, savedAt);
		await expect(thrown).rejects.toThrow('network');
		expect(await failed).toEqual({ ok: false });
		await third;
		expect(next).toHaveBeenCalledWith('t0');
	});
});

describe('diff view apply wiring (#184)', () => {
	const src = readFileSync(
		resolve(__dirname, '../../admin/app/admin/books/[slug]/_components/diff-view.tsx'),
		'utf8',
	);

	it('sends patchBook through the save gate', () => {
		expect(src).toMatch(/from '@app\/serial-save'/);
		expect(src).toMatch(/useState\(createSaveGate\)/);
		expect(src).toMatch(/serializeSave\(\s*gate,\s*\(\)\s*=>\s*patchBook\(/);
	});

	it('frees the gate only when the refreshed row lands', () => {
		expect(src).toMatch(/book\.updated_at !== gateAt/);
		expect(src).toMatch(/setGate\(createSaveGate\(\)\)/);
		expect(src).not.toMatch(/const \[applyPending, startApply\] = useTransition\(\)/);
	});
});

describe('books table inline edit wiring (#184)', () => {
	const src = readFileSync(
		resolve(__dirname, '../../admin/app/admin/books/_components/books-table.tsx'),
		'utf8',
	);

	it('queues inline saves per row with the carried updated_at', () => {
		expect(src).toMatch(/useState\(createRowSaveQueue\)/);
		expect(src).toMatch(
			/queueRowSave\(\s*saveQueue,\s*id,\s*loadedAt,\s*\(at\)\s*=>\s*patchBook\(\s*id,\s*at,/,
		);
		expect(src).not.toMatch(/await patchBook\(\s*id,\s*loadedAt/);
	});
});
