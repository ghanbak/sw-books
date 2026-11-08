import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
	createRowSaveQueue,
	createSaveGate,
	newerUpdatedAt,
	queueRowSave,
	serializeSave,
} from '../serial-save';

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

const T0 = '2026-11-08T10:00:00.000000+00:00';
const T1 = '2026-11-08T10:01:00.000000+00:00';
const T5 = '2026-11-08T10:05:00.000000+00:00';
const T6 = '2026-11-08T10:06:00.000000+00:00';

/** A row guarded on `updated_at`, with saves held until `open()`. */
function guardedRow(initial: string, nextAt: string) {
	let current = initial;
	const held = deferred<void>();
	const send = vi.fn(async (at: string | null): Promise<Saved> => {
		await held.promise;
		if (at !== current) return { ok: false };
		current = nextAt;
		return { ok: true, at: nextAt };
	});
	return {
		send,
		open: () => held.resolve(),
		bump: (at: string) => {
			current = at;
		},
	};
}

describe('queueRowSave after CONFLICT and Reload (#201)', () => {
	it("a save queued after a Reload sends the caller's fresher updated_at", async () => {
		const queue = createRowSaveQueue();
		const row = guardedRow(T0, T6);
		row.bump(T5); // Another writer, before the table's edit lands.
		const stale = queueRowSave(queue, 'a', T0, row.send, savedAt);
		const reloaded = queueRowSave(queue, 'a', T5, row.send, savedAt);
		row.open();
		expect(await stale).toEqual({ ok: false });
		expect(await reloaded).toEqual({ ok: true, at: T6 });
		expect(row.send.mock.calls.map((c) => c[0])).toEqual([T0, T5]);
	});

	it('an edit queued before the Reload still gets CONFLICT', async () => {
		const queue = createRowSaveQueue();
		const row = guardedRow(T0, T6);
		row.bump(T5);
		const first = queueRowSave(queue, 'a', T0, row.send, savedAt);
		const queuedBefore = queueRowSave(queue, 'a', T0, row.send, savedAt);
		const afterReload = queueRowSave(queue, 'a', T5, row.send, savedAt);
		row.open();
		expect(await first).toEqual({ ok: false });
		expect(await queuedBefore).toEqual({ ok: false });
		expect(await afterReload).toEqual({ ok: true, at: T6 });
		expect(row.send.mock.calls.map((c) => c[0])).toEqual([T0, T0, T5]);
	});

	it('every edit gets CONFLICT when no Reload brought a fresher value', async () => {
		const queue = createRowSaveQueue();
		const row = guardedRow(T0, T6);
		row.bump(T5);
		const saves = [1, 2, 3].map(() => queueRowSave(queue, 'a', T0, row.send, savedAt));
		row.open();
		expect(await Promise.all(saves)).toEqual([{ ok: false }, { ok: false }, { ok: false }]);
		expect(row.send.mock.calls.map((c) => c[0])).toEqual([T0, T0, T0]);
	});

	it("a failed save doesn't lend its fresher value to a later stale edit", async () => {
		const queue = createRowSaveQueue();
		const d = deferred<Saved>();
		const send = vi.fn((_at: string | null) => d.promise);
		void queueRowSave(queue, 'a', T0, send, savedAt);
		void queueRowSave(queue, 'a', T5, send, savedAt);
		void queueRowSave(queue, 'a', T0, send, savedAt);
		d.resolve({ ok: false });
		await new Promise((r) => setTimeout(r, 0));
		expect(send.mock.calls.map((c) => c[0])).toEqual([T0, T5, T0]);
	});

	it("keeps the slot's newer updated_at over an older caller", async () => {
		const queue = createRowSaveQueue();
		const d = deferred<Saved>();
		const send = vi.fn(
			(at: string | null): Promise<Saved> =>
				at === T0 ? d.promise : Promise.resolve({ ok: true, at: T6 }),
		);
		const first = queueRowSave(queue, 'a', T0, send, savedAt);
		const second = queueRowSave(queue, 'a', T0, send, savedAt);
		d.resolve({ ok: true, at: T1 });
		await Promise.all([first, second]);
		expect(send.mock.calls.map((c) => c[0])).toEqual([T0, T1]);
	});

	it.each([null, '', 'not-a-date'])('keeps the slot value for a loadedAt of %j', async (bad) => {
		const queue = createRowSaveQueue();
		const d = deferred<Saved>();
		const send = vi.fn(
			(at: string | null): Promise<Saved> =>
				at === T0 ? d.promise : Promise.resolve({ ok: true, at: T6 }),
		);
		const first = queueRowSave(queue, 'a', T0, send, savedAt);
		const second = queueRowSave(queue, 'a', bad, send, savedAt);
		d.resolve({ ok: true, at: T1 });
		await Promise.all([first, second]);
		expect(send.mock.calls.map((c) => c[0])).toEqual([T0, T1]);
	});
});

describe('newerUpdatedAt (#201)', () => {
	it('compares instants across offsets, not raw strings', () => {
		const tenUtc = '2026-11-08T12:00:00+02:00';
		const elevenUtc = '2026-11-08T11:00:00Z';
		expect(newerUpdatedAt(tenUtc, elevenUtc)).toBe(elevenUtc);
		expect(newerUpdatedAt(elevenUtc, tenUtc)).toBe(elevenUtc);
	});

	it('orders values that differ only in microseconds', () => {
		const earlier = '2026-11-08T10:00:00.123456+00:00';
		const later = '2026-11-08T10:00:00.123789+00:00';
		expect(newerUpdatedAt(earlier, later)).toBe(later);
		expect(newerUpdatedAt(later, earlier)).toBe(later);
	});

	it('keeps the current value when both are the same instant', () => {
		const postgres = '2026-11-08T10:00:00.5+00:00';
		const js = '2026-11-08T10:00:00.500Z';
		expect(newerUpdatedAt(postgres, js)).toBe(postgres);
		expect(newerUpdatedAt(js, postgres)).toBe(js);
	});

	it('reads the Postgres text format with a short offset', () => {
		const later = '2026-11-08 10:06:00.25-05';
		expect(newerUpdatedAt(T0, later)).toBe(later);
	});

	it.each([null, '', 'x 1', '2026-13-40T00:00:00Z', '2026-11-08T10:00:00'])(
		'ignores a missing or invalid candidate: %j',
		(bad) => {
			expect(newerUpdatedAt(T0, bad)).toBe(T0);
		},
	);

	it('takes a valid candidate over a missing or invalid current value', () => {
		expect(newerUpdatedAt(null, T0)).toBe(T0);
		expect(newerUpdatedAt('garbage', T0)).toBe(T0);
	});

	it('keeps the current value when neither is valid', () => {
		expect(newerUpdatedAt('t0', 't1')).toBe('t0');
		expect(newerUpdatedAt(null, null)).toBeNull();
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

	it('bridges the gap between a drained chain and the setData commit (#201)', () => {
		expect(src).toMatch(
			/loadedAt = newerUpdatedAt\(\s*data\.find\([^;]*confirmedAt\.current\.get\(id\)/,
		);
		expect(src).toMatch(/confirmedAt\.current\.set\(id,\s*updated_at\)/);
		expect(src).toMatch(/confirmedAt\.current\.clear\(\);\s*\},\s*\[data\]\)/);
	});
});
