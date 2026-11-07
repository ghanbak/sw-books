import type { UserBook } from '@/lib/hooks';
import {
	type ShelfToggleDeps,
	type ShelfWrite,
	createShelfToggler,
	planToggle,
	setShelfRow,
} from '@/lib/shelf';
import { describe, expect, it, vi } from 'vitest';

function row(partial: Partial<UserBook> & { book_id: string }): UserBook {
	return {
		id: `row-${partial.book_id}`,
		user_id: 'user-a',
		owned: false,
		read: false,
		want_to_read: false,
		favorite: false,
		created_at: null,
		updated_at: null,
		...partial,
	};
}

type WriteResult = Awaited<ReturnType<ShelfToggleDeps['write']>>;

/** In-memory store + a write fake whose calls resolve only when the test says so. */
function harness(initial: UserBook[] = []) {
	let map = new Map(initial.map((r) => [r.book_id, r]));
	const pending: { write: ShelfWrite; resolve: (r: WriteResult) => void }[] = [];
	const deps: ShelfToggleDeps = {
		get: (bookId) => map.get(bookId),
		set: (bookId, r) => {
			map = setShelfRow(map, bookId, r);
		},
		write: vi.fn(
			(write: ShelfWrite) =>
				new Promise<WriteResult>((resolve) => {
					pending.push({ write, resolve });
				}),
		),
		onError: vi.fn(),
	};
	return { deps, pending, toggle: createShelfToggler(deps), state: () => map };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createShelfToggler — double-tap', () => {
	it('ignores a second tap on the same book while the first insert is pending', async () => {
		const h = harness();
		const first = h.toggle('b1', 'owned', 'user-a');
		const second = h.toggle('b1', 'owned', 'user-a');

		expect(await second).toBe('ignored');
		expect(h.deps.write).toHaveBeenCalledTimes(1);

		const inserted = row({ id: 'srv-1', book_id: 'b1', owned: true });
		h.pending[0].resolve({ row: inserted, error: null });
		expect(await first).toBe('ok');
		expect(h.state().get('b1')).toEqual(inserted);
	});

	it('ignores a second tap on another field of the same book while an update is pending', async () => {
		const h = harness([row({ book_id: 'b1', owned: true })]);
		const first = h.toggle('b1', 'read', 'user-a');
		expect(await h.toggle('b1', 'favorite', 'user-a')).toBe('ignored');
		expect(h.deps.write).toHaveBeenCalledTimes(1);
		h.pending[0].resolve({ row: null, error: null });
		await first;
		expect(h.state().get('b1')).toMatchObject({ owned: true, read: true, favorite: false });
	});

	it('releases the guard after the write settles, success or failure', async () => {
		const h = harness([row({ book_id: 'b1', owned: true })]);
		const first = h.toggle('b1', 'read', 'user-a');
		h.pending[0].resolve({ row: null, error: { message: 'offline' } });
		await first;
		const second = h.toggle('b1', 'read', 'user-a');
		await flush();
		expect(h.deps.write).toHaveBeenCalledTimes(2);
		h.pending[1].resolve({ row: null, error: null });
		expect(await second).toBe('ok');
	});

	it('guards per book — a different book is not blocked', async () => {
		const h = harness();
		h.toggle('b1', 'owned', 'user-a');
		h.toggle('b2', 'owned', 'user-a');
		await flush();
		expect(h.deps.write).toHaveBeenCalledTimes(2);
	});
});

describe('createShelfToggler — first flag (insert)', () => {
	it('shows the book on the shelf before the server answers', async () => {
		const h = harness();
		h.toggle('b1', 'want_to_read', 'user-a');
		expect(h.state().get('b1')).toMatchObject({
			book_id: 'b1',
			want_to_read: true,
			owned: false,
			read: false,
			favorite: false,
		});
	});

	it('rolls back and surfaces the error when the insert fails', async () => {
		const h = harness();
		const p = h.toggle('b1', 'owned', 'user-a');
		h.pending[0].resolve({ row: null, error: { message: 'insert failed' } });

		expect(await p).toBe('failed');
		expect(h.state().has('b1')).toBe(false);
		expect(h.deps.onError).toHaveBeenCalledTimes(1);
		expect(h.deps.onError).toHaveBeenCalledWith({ message: 'insert failed' });
	});
});

describe('createShelfToggler — existing row (update/delete)', () => {
	it('rolls back to the pre-tap row and surfaces the error when an update fails', async () => {
		const before = row({ book_id: 'b1', owned: true });
		const h = harness([before]);
		const p = h.toggle('b1', 'read', 'user-a');
		expect(h.state().get('b1')).toMatchObject({ owned: true, read: true });

		h.pending[0].resolve({ row: null, error: { message: 'update failed' } });
		expect(await p).toBe('failed');
		expect(h.state().get('b1')).toEqual(before);
		expect(h.deps.onError).toHaveBeenCalledTimes(1);
	});

	it('restores the row when clearing the last flag (delete) fails', async () => {
		const before = row({ book_id: 'b1', read: true });
		const h = harness([before]);
		const p = h.toggle('b1', 'read', 'user-a');
		expect(h.state().has('b1')).toBe(false);

		h.pending[0].resolve({ row: null, error: { message: 'delete failed' } });
		await p;
		expect(h.state().get('b1')).toEqual(before);
		expect(h.deps.onError).toHaveBeenCalledTimes(1);
	});

	it('rollback leaves other books untouched', async () => {
		const other = row({ book_id: 'b2', favorite: true });
		const h = harness([row({ book_id: 'b1', owned: true }), other]);
		const p = h.toggle('b1', 'owned', 'user-a');
		h.pending[0].resolve({ row: null, error: { message: 'x' } });
		await p;
		expect(h.state().get('b2')).toBe(other);
	});
});

describe('planToggle', () => {
	it('plans an insert with only the tapped flag set', () => {
		expect(planToggle(undefined, 'b1', 'favorite', 'user-a').write).toEqual({
			kind: 'insert',
			entry: {
				user_id: 'user-a',
				book_id: 'b1',
				owned: false,
				read: false,
				want_to_read: false,
				favorite: true,
			},
		});
	});

	it('plans an update patching only the tapped flag', () => {
		const existing = row({ book_id: 'b1', owned: true });
		expect(planToggle(existing, 'b1', 'read', 'user-a')).toEqual({
			optimistic: { ...existing, read: true },
			write: { kind: 'update', id: existing.id, patch: { read: true } },
		});
	});

	it('plans a delete when the last flag is cleared', () => {
		const existing = row({ book_id: 'b1', owned: true });
		expect(planToggle(existing, 'b1', 'owned', 'user-a')).toEqual({
			optimistic: null,
			write: { kind: 'delete', id: existing.id },
		});
	});
});
