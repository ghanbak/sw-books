import { describe, expect, it, vi } from 'vitest';
import { DB_ERROR } from '../action-errors';
import { CONFLICT_ERROR, NOT_FOUND_ERROR, guardedUpdate } from '../stale-write';

type Row = { id: string; title: string; updated_at: string | null };

/** In-memory stand-in for the books table with the same UPDATE … WHERE semantics. */
function fakeTable(initial: Row | null) {
	let row = initial;
	let clock = 0;
	return {
		get row() {
			return row;
		},
		/** Another session writes the row, bumping updated_at like the trigger does. */
		touch() {
			if (row) row = { ...row, updated_at: `2026-11-06T00:00:0${++clock}.000000+00:00` };
		},
		query(patch: Partial<Row>) {
			return {
				update: async (expected: string | null) => {
					if (!row || row.updated_at !== expected) return { data: null, error: null };
					row = { ...row, ...patch, updated_at: `2026-11-06T00:00:0${++clock}.000000+00:00` };
					return { data: row, error: null };
				},
				current: async () => ({
					data: row ? { updated_at: row.updated_at } : null,
					error: null,
				}),
			};
		},
	};
}

const loaded = '2026-11-06T00:00:00.000000+00:00';

describe('guardedUpdate', () => {
	it('applies the write when updated_at still matches', async () => {
		const t = fakeTable({ id: 'a', title: 'Old', updated_at: loaded });
		const res = await guardedUpdate('patchBook', loaded, t.query({ title: 'New' }));
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.data.title).toBe('New');
			expect(res.data.updated_at).not.toBe(loaded);
		}
	});

	it('rejects a stale write with CONFLICT and leaves the row untouched', async () => {
		const t = fakeTable({ id: 'a', title: 'Old', updated_at: loaded });
		t.touch(); // someone else saved after we loaded
		const before = t.row;
		const res = await guardedUpdate('patchBook', loaded, t.query({ title: 'Mine' }));
		expect(res).toEqual({ ok: false, error: CONFLICT_ERROR });
		expect(t.row).toEqual(before);
	});

	it('rejects the second of two writes based on the same load', async () => {
		const t = fakeTable({ id: 'a', title: 'Old', updated_at: loaded });
		const first = await guardedUpdate('patchBook', loaded, t.query({ title: 'Tab 1' }));
		const second = await guardedUpdate('patchBook', loaded, t.query({ title: 'Tab 2' }));
		expect(first.ok).toBe(true);
		expect(second).toEqual({ ok: false, error: CONFLICT_ERROR });
		expect(t.row?.title).toBe('Tab 1');
	});

	it('matches a null updated_at', async () => {
		const t = fakeTable({ id: 'a', title: 'Old', updated_at: null });
		const res = await guardedUpdate('patchBook', null, t.query({ title: 'New' }));
		expect(res.ok).toBe(true);
	});

	it('reports NOT_FOUND when the row is gone', async () => {
		const t = fakeTable(null);
		const res = await guardedUpdate('patchBook', loaded, t.query({ title: 'New' }));
		expect(res).toEqual({ ok: false, error: NOT_FOUND_ERROR });
	});

	it('maps a DB error to a generic code and logs the raw one', async () => {
		const log = vi.fn();
		const raw = { code: '42501', message: 'permission denied for table books' };
		const res = await guardedUpdate(
			'patchBook',
			loaded,
			{
				update: async () => ({ data: null, error: raw }),
				current: async () => ({ data: null, error: null }),
			},
			log,
		);
		expect(res).toEqual({ ok: false, error: DB_ERROR });
		expect(JSON.stringify(res)).not.toContain('permission denied');
		expect(log).toHaveBeenCalledOnce();
	});

	it('maps an error on the follow-up read too', async () => {
		const log = vi.fn();
		const res = await guardedUpdate(
			'patchBook',
			loaded,
			{
				update: async () => ({ data: null, error: null }),
				current: async () => ({ data: null, error: { message: 'fetch failed' } }),
			},
			log,
		);
		expect(res).toEqual({ ok: false, error: DB_ERROR });
	});
});
