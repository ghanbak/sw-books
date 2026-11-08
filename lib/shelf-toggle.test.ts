import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { UserBook } from '@/lib/hooks';
import {
	type AddOwnedDeps,
	type ShelfDb,
	type ShelfToggleDeps,
	type ShelfWrite,
	type ShelfWriteTracker,
	applyOwnedOptimistic,
	createOwnedAdder,
	createShelfToggler,
	createShelfWriteScope,
	createShelfWriteTracker,
	createShelfWriter,
	mergeFetchedShelf,
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
	let signedIn = 'user-a';
	const writes = createShelfWriteTracker();
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
		writes,
		isCurrentUser: (id) => id === signedIn,
	};
	return {
		deps,
		pending,
		writes,
		toggle: createShelfToggler(deps),
		state: () => map,
		/** Simulate another writer (addOwned) replacing the Map. */
		replace: (next: Map<string, UserBook>) => {
			map = next;
		},
		signIn: (id: string) => {
			signedIn = id;
		},
	};
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

describe('createShelfToggler — concurrent addOwned (#102)', () => {
	it('ignores a toggle on a book whose addOwned batch is pending', async () => {
		const h = harness();
		h.replace(applyOwnedOptimistic(h.state(), ['b1'], 'user-a'));
		h.writes.claim(['b1']); // addOwned in flight

		expect(await h.toggle('b1', 'read', 'user-a')).toBe('ignored');
		expect(h.deps.write).not.toHaveBeenCalled();

		h.writes.release(['b1']);
		h.replace(new Map([['b1', row({ id: 'srv-1', book_id: 'b1', owned: true })]]));
		h.toggle('b1', 'read', 'user-a');
		expect(h.deps.write).toHaveBeenCalledWith({
			kind: 'update',
			id: 'srv-1',
			patch: { read: true },
		});
	});

	it('never writes back an optimistic placeholder id', async () => {
		const h = harness();
		h.replace(applyOwnedOptimistic(h.state(), ['b1'], 'user-a'));
		expect(await h.toggle('b1', 'favorite', 'user-a')).toBe('ignored');
		expect(h.deps.write).not.toHaveBeenCalled();
	});

	it('a failed toggle keeps an owned flag set by addOwned while it was pending', async () => {
		const h = harness([row({ book_id: 'b1', read: true })]);
		const p = h.toggle('b1', 'favorite', 'user-a');
		h.replace(applyOwnedOptimistic(h.state(), ['b1'], 'user-a'));

		h.pending[0].resolve({ row: null, error: { message: 'offline' } });
		expect(await p).toBe('failed');
		expect(h.state().get('b1')).toMatchObject({ owned: true, read: true, favorite: false });
	});

	it('a successful insert keeps an owned flag set by addOwned while it was pending', async () => {
		const h = harness();
		const p = h.toggle('b1', 'read', 'user-a');
		h.replace(applyOwnedOptimistic(h.state(), ['b1'], 'user-a'));

		const inserted = row({ id: 'srv-1', book_id: 'b1', read: true });
		h.pending[0].resolve({ row: inserted, error: null });
		await p;
		expect(h.state().get('b1')).toMatchObject({ id: 'srv-1', owned: true, read: true });
	});
});

describe('createShelfToggler — user change (#102)', () => {
	it('a write settling after sign-out leaves the new state alone', async () => {
		const h = harness();
		const p = h.toggle('b1', 'owned', 'user-a');
		h.signIn('user-b');
		h.replace(new Map());

		h.pending[0].resolve({ row: row({ id: 'srv-1', book_id: 'b1', owned: true }), error: null });
		expect(await p).toBe('stale');
		expect(h.state().size).toBe(0);
	});

	it('a failure settling after sign-out neither rolls back nor alerts', async () => {
		const h = harness([row({ book_id: 'b1', owned: true })]);
		const p = h.toggle('b1', 'read', 'user-a');
		h.signIn('user-b');
		h.replace(new Map());

		h.pending[0].resolve({ row: null, error: { message: 'x' } });
		await p;
		expect(h.state().size).toBe(0);
		expect(h.deps.onError).not.toHaveBeenCalled();
	});
});

type RpcResult = Awaited<ReturnType<AddOwnedDeps['rpc']>>;

/**
 * Mirrors UserBooksProvider's wiring: a ref (read synchronously by writers) and React
 * state (updated functionally), one write tracker per user, a toggler and an adder per
 * tracker, and a fetch that merges with `mergeFetchedShelf`. Writes resolve on demand.
 */
function provider(initial: UserBook[] = [], opts: { deferState?: boolean } = {}) {
	/** With `deferState`, addOwned's state updaters run only on `flushState()` (a deferred setUserBooks). */
	const queued: ((prev: ReadonlyMap<string, UserBook>) => Map<string, UserBook>)[] = [];
	let ref = new Map(initial.map((r) => [r.book_id, r]));
	let state = ref;
	let userId = 'user-a';
	const writesFor = createShelfWriteScope();
	const toggleWrites: { write: ShelfWrite; resolve: (r: WriteResult) => void }[] = [];
	const rpcs: { ids: string[]; resolve: (r: RpcResult) => void }[] = [];
	const onError = vi.fn();
	const build = (writes: ShelfWriteTracker) => ({
		toggle: createShelfToggler({
			get: (bookId) => ref.get(bookId),
			set: (bookId, r) => {
				ref = setShelfRow(ref, bookId, r);
				state = setShelfRow(state, bookId, r);
			},
			write: (write) =>
				new Promise<WriteResult>((resolve) => {
					toggleWrites.push({ write, resolve });
				}),
			onError,
			writes,
			isCurrentUser: (id) => id === userId,
		}),
		addOwned: createOwnedAdder({
			current: () => ref,
			update: (fn) => {
				ref = fn(ref);
				if (opts.deferState) queued.push(fn);
				else state = fn(state);
			},
			rpc: (ids) =>
				new Promise<RpcResult>((resolve) => {
					rpcs.push({ ids, resolve });
				}),
			writes,
			isCurrentUser: (id) => id === userId,
		}),
	});
	const writers = () => build(writesFor(userId));
	let current = writers();
	return {
		toggleWrites,
		rpcs,
		onError,
		ref: () => ref,
		state: () => state,
		flushState: () => {
			for (const fn of queued.splice(0)) state = fn(state);
		},
		toggle: (bookId: string, field: Parameters<typeof current.toggle>[1]) =>
			current.toggle(bookId, field, userId),
		addOwned: (ids: string[]) => current.addOwned(ids, userId),
		/** Account switch: new user id, writers rebuilt (the provider's useMemo on `writes`). */
		switchUser: (id: string) => {
			userId = id;
			current = writers();
		},
		/** Start a user_books fetch; call the result with the server rows to land it. */
		startFetch: () => {
			const writes = writesFor(userId);
			const startSeq = writes.seq();
			return (rows: UserBook[]) => {
				writes.adoptFetched(rows);
				const keep = (bookId: string) => writes.touchedSince(bookId, startSeq);
				ref = mergeFetchedShelf(rows, ref, keep);
				state = mergeFetchedShelf(rows, state, keep);
			};
		},
	};
}

describe('shelf provider — write tracker per user (#133)', () => {
	it("user B's first fetch wins over user A's pending toggle", async () => {
		const p = provider();
		const pendingToggle = p.toggle('b1', 'owned');
		expect(p.state().get('b1')?.id).toMatch(/^optimistic:/);

		p.switchUser('user-b');
		const land = p.startFetch();
		const bRow = row({ id: 'srv-b1', user_id: 'user-b', book_id: 'b1', read: true });
		land([bRow]);

		expect(p.state().get('b1')).toEqual(bRow);
		expect([...p.state().values()].some((r) => r.user_id === 'user-a')).toBe(false);

		p.toggleWrites[0].resolve({
			row: row({ id: 'srv-a1', book_id: 'b1', owned: true }),
			error: null,
		});
		expect(await pendingToggle).toBe('stale');
		expect(p.state().get('b1')).toEqual(bRow);
	});

	it("user A's write settling during user B's fetch doesn't shadow B's rows", async () => {
		const p = provider();
		const pendingToggle = p.toggle('b1', 'owned');
		p.switchUser('user-b');
		const land = p.startFetch();
		p.toggleWrites[0].resolve({
			row: row({ id: 'srv-a1', book_id: 'b1', owned: true }),
			error: null,
		});
		await pendingToggle;

		const bRow = row({ id: 'srv-b1', user_id: 'user-b', book_id: 'b1', favorite: true });
		land([bRow]);
		expect(p.state().get('b1')).toEqual(bRow);
	});
});

describe('shelf provider — addOwned rollback (#133)', () => {
	it('a failed addOwned reverts only its own books; a toggle on another book survives', async () => {
		const p = provider([row({ book_id: 'b2', owned: true })]);
		const add = p.addOwned(['b1']);
		const toggle = p.toggle('b2', 'read');
		expect(p.state().get('b1')).toMatchObject({ owned: true });
		expect(p.state().get('b2')).toMatchObject({ owned: true, read: true });

		p.toggleWrites[0].resolve({ row: null, error: null });
		expect(await toggle).toBe('ok');
		p.rpcs[0].resolve({ rows: null, error: { message: 'rpc failed' } });
		expect(await add).toMatchObject({ ok: false, error: { code: 'add_failed' } });

		expect(p.state().has('b1')).toBe(false);
		expect(p.state().get('b2')).toMatchObject({ owned: true, read: true });
		expect(p.ref()).toEqual(p.state());
	});

	it('a failed addOwned restores an already-shelved book to its pre-call row', async () => {
		const before = row({ book_id: 'b1', want_to_read: true });
		const p = provider([before]);
		const add = p.addOwned(['b1', 'b1']);
		expect(p.rpcs[0].ids).toEqual(['b1']);
		p.rpcs[0].resolve({ rows: null, error: { message: 'x' } });
		await add;
		expect(p.state().get('b1')).toEqual(before);
		expect(p.ref()).toEqual(p.state());
	});

	it('a successful addOwned replaces placeholders with the returned rows', async () => {
		const p = provider();
		const add = p.addOwned(['b1']);
		const srv = row({ id: 'srv-1', book_id: 'b1', owned: true });
		p.rpcs[0].resolve({ rows: [srv], error: null });
		expect(await add).toEqual({ ok: true, data: { rows: [srv] } });
		expect(p.state().get('b1')).toEqual(srv);
		expect(p.ref()).toEqual(p.state());
	});
});

describe('shelf provider — failed write during the first fetch (#133)', () => {
	it('a toggle that fails and reverts during the first fetch lets the fetched row win', async () => {
		const p = provider(); // cold launch: nothing local yet
		const land = p.startFetch();
		// The book is already shelved server-side; the insert hits UNIQUE and reverts.
		const toggle = p.toggle('b1', 'owned');
		p.toggleWrites[0].resolve({ row: null, error: { message: 'duplicate key' } });
		expect(await toggle).toBe('failed');
		expect(p.state().has('b1')).toBe(false);

		const srv = row({ id: 'srv-1', book_id: 'b1', read: true });
		land([srv]);
		expect(p.state().get('b1')).toEqual(srv);

		// The next tap updates the real row instead of re-inserting.
		p.toggle('b1', 'owned');
		expect(p.toggleWrites[1].write).toEqual({
			kind: 'update',
			id: 'srv-1',
			patch: { owned: true },
		});
	});

	it('a failed addOwned during the first fetch lets the fetched rows win', async () => {
		const p = provider();
		const land = p.startFetch();
		const add = p.addOwned(['b1']);
		p.rpcs[0].resolve({ rows: null, error: { message: 'x' } });
		await add;

		const srv = row({ id: 'srv-1', book_id: 'b1', owned: true });
		land([srv]);
		expect(p.state().get('b1')).toEqual(srv);
	});

	it('a successful toggle during the fetch still keeps the local row', async () => {
		const p = provider();
		const land = p.startFetch();
		const toggle = p.toggle('b1', 'read');
		const inserted = row({ id: 'srv-1', book_id: 'b1', read: true });
		p.toggleWrites[0].resolve({ row: inserted, error: null });
		await toggle;
		land([]);
		expect(p.state().get('b1')).toEqual(inserted);
	});
});

describe('shelf provider — fetch lands during a pending write (#146)', () => {
	it('a toggle that fails after the fetch landed restores the fetched row', async () => {
		const p = provider(); // cold launch: nothing local yet
		const land = p.startFetch();
		const toggle = p.toggle('b1', 'owned'); // insert pending
		const srv = row({ id: 'srv-1', book_id: 'b1', read: true });
		land([srv]);
		expect(p.state().get('b1')?.id).toMatch(/^optimistic:/); // pending write keeps local

		p.toggleWrites[0].resolve({ row: null, error: { message: 'duplicate key' } });
		expect(await toggle).toBe('failed');
		expect(p.state().get('b1')).toEqual(srv);
		expect(p.ref()).toEqual(p.state());

		// The next tap updates the real row instead of hitting UNIQUE again.
		p.toggle('b1', 'owned');
		expect(p.toggleWrites[1].write).toEqual({
			kind: 'update',
			id: 'srv-1',
			patch: { owned: true },
		});
	});

	it('a failed update after the fetch landed restores the fetched row, not the pre-tap one', async () => {
		const before = row({ book_id: 'b1', owned: true });
		const p = provider([before]);
		const land = p.startFetch();
		const toggle = p.toggle('b1', 'favorite');
		const srv = row({ book_id: 'b1', owned: true, read: true });
		land([srv]);

		p.toggleWrites[0].resolve({ row: null, error: { message: 'offline' } });
		await toggle;
		expect(p.state().get('b1')).toEqual(srv);
	});

	it('an addOwned that fails after the fetch landed restores the fetched rows', async () => {
		const p = provider();
		const land = p.startFetch();
		const add = p.addOwned(['b1', 'b2']);
		const srv = row({ id: 'srv-1', book_id: 'b1', want_to_read: true });
		land([srv]);
		expect(p.state().get('b1')?.id).toMatch(/^optimistic:/);

		p.rpcs[0].resolve({ rows: null, error: { message: 'rpc failed' } });
		await add;
		expect(p.state().get('b1')).toEqual(srv);
		expect(p.state().has('b2')).toBe(false);
		expect(p.ref()).toEqual(p.state());
	});

	it('a deferred state updater rolls back to the fetched row like the ref', async () => {
		const p = provider([], { deferState: true });
		const land = p.startFetch();
		const add = p.addOwned(['b1']);
		const srv = row({ id: 'srv-1', book_id: 'b1', read: true });
		land([srv]);
		p.rpcs[0].resolve({ rows: null, error: { message: 'rpc failed' } });
		await add; // the write is released before React runs the updater
		p.flushState();
		expect(p.ref().get('b1')).toEqual(srv);
		expect(p.state().get('b1')).toEqual(srv);
	});

	it("a failed addOwned keeps an overlapping addOwned's committed owned flag", async () => {
		const p = provider();
		const land = p.startFetch();
		const first = p.addOwned(['b1']);
		const second = p.addOwned(['b1']);
		land([row({ id: 'srv-1', book_id: 'b1', read: true })]);

		const committed = row({ id: 'srv-1', book_id: 'b1', owned: true, read: true });
		p.rpcs[0].resolve({ rows: [committed], error: null });
		await first;
		p.rpcs[1].resolve({ rows: null, error: { message: 'rpc failed' } });
		await second;
		expect(p.state().get('b1')).toMatchObject({ id: 'srv-1', owned: true, read: true });
		expect(p.ref()).toEqual(p.state());
	});

	it('a later write does not reuse an earlier fetch as its rollback target', async () => {
		const p = provider();
		const land = p.startFetch();
		const first = p.toggle('b1', 'owned');
		land([row({ id: 'srv-1', book_id: 'b1', read: true })]);
		p.toggleWrites[0].resolve({ row: null, error: { message: 'x' } });
		await first;

		const local = p.state().get('b1');
		const second = p.toggle('b1', 'favorite');
		p.toggleWrites[1].resolve({ row: null, error: { message: 'x' } });
		await second;
		expect(p.state().get('b1')).toEqual(local);
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

/** `user_books` fake: `rows` is the server table; ids of deleted rows match nothing. */
function fakeDb(rows: UserBook[] = []) {
	const table = new Map(rows.map((r) => [r.id, r]));
	let nextId = 1;
	const db = {
		insert: vi.fn(async (entry: Parameters<ShelfDb['insert']>[0]) => {
			const dup = [...table.values()].some(
				(r) => r.user_id === entry.user_id && r.book_id === entry.book_id,
			);
			if (dup) return { data: null, error: { message: 'duplicate key (user_id, book_id)' } };
			const inserted = row({ ...entry, id: `server-${nextId++}` } as UserBook);
			table.set(inserted.id, inserted);
			return { data: inserted, error: null };
		}),
		update: vi.fn<ShelfDb['update']>(async (id, patch) => {
			const hit = table.get(id);
			if (!hit) return { data: [], error: null }; // PostgREST: 0 rows is not an error
			table.set(id, { ...hit, ...patch });
			return { data: [{ id }], error: null };
		}),
		remove: vi.fn(async (id: string) => {
			table.delete(id);
			return { error: null };
		}),
	} satisfies ShelfDb;
	return { db, table };
}

function writerHarness(local: UserBook[], server: UserBook[]) {
	const h = harness(local);
	const { db, table } = fakeDb(server);
	h.deps.write = createShelfWriter(db);
	return { ...h, db, table, toggle: createShelfToggler(h.deps) };
}

describe('createShelfWriter — row gone on the server (#195)', () => {
	it('an update matching no row recreates it with the shown flags, not a silent ok', async () => {
		const stale = row({ book_id: 'b1', read: true });
		const h = writerHarness([stale], []); // another device deleted the row

		expect(await h.toggle('b1', 'owned', 'user-a')).toBe('ok');
		expect(h.db.insert).toHaveBeenCalledWith({
			user_id: 'user-a',
			book_id: 'b1',
			owned: true,
			read: true,
			want_to_read: false,
			favorite: false,
		});
		const server = [...h.table.values()];
		expect(server).toHaveLength(1);
		expect(server[0]).toMatchObject({ book_id: 'b1', owned: true, read: true });
		// Local row now carries the recreated id, so the next tap hits a real row.
		expect(h.state().get('b1')).toEqual(server[0]);
		expect(h.deps.onError).not.toHaveBeenCalled();
	});

	it('an update matching no row reverts and alerts when the recreate conflicts', async () => {
		const stale = row({ book_id: 'b1', read: true });
		const recreated = row({ id: 'other-device', book_id: 'b1', favorite: true });
		const h = writerHarness([stale], [recreated]);

		expect(await h.toggle('b1', 'owned', 'user-a')).toBe('failed');
		expect(h.state().get('b1')).toEqual(stale);
		expect(h.deps.onError).toHaveBeenCalledTimes(1);
		// The other device's row is not clobbered.
		expect(h.table.get('other-device')).toEqual(recreated);
	});

	it('an update matching its row does not insert', async () => {
		const existing = row({ book_id: 'b1', read: true });
		const h = writerHarness([existing], [existing]);

		expect(await h.toggle('b1', 'owned', 'user-a')).toBe('ok');
		expect(h.db.insert).not.toHaveBeenCalled();
		expect(h.table.get(existing.id)).toMatchObject({ owned: true, read: true });
		expect(h.state().get('b1')).toMatchObject({ id: existing.id, owned: true, read: true });
	});

	it('an update error is reported without a recreate', async () => {
		const existing = row({ book_id: 'b1', read: true });
		const h = writerHarness([existing], [existing]);
		h.db.update.mockResolvedValueOnce({ data: null, error: { message: 'network' } });

		expect(await h.toggle('b1', 'owned', 'user-a')).toBe('failed');
		expect(h.db.insert).not.toHaveBeenCalled();
		expect(h.state().get('b1')).toEqual(existing);
		expect(h.deps.onError).toHaveBeenCalledWith({ message: 'network' });
	});

	it('a delete matching no row resolves as done, with no alert', async () => {
		const stale = row({ book_id: 'b1', read: true });
		const h = writerHarness([stale], []);

		expect(await h.toggle('b1', 'read', 'user-a')).toBe('ok');
		expect(h.state().has('b1')).toBe(false);
		expect(h.db.insert).not.toHaveBeenCalled();
		expect(h.deps.onError).not.toHaveBeenCalled();
	});
});

describe('shelf provider wiring (#195)', () => {
	const src = readFileSync(resolve(__dirname, 'hooks.tsx'), 'utf8');

	it('the toggler writes through createShelfWriter', () => {
		expect(src).toMatch(/write:\s*createShelfWriter\(\s*\{/);
	});

	it('the update returns its matched rows', () => {
		expect(src).toMatch(
			/\.update\(\s*patch\s*\)\s*\.eq\(\s*'id',\s*id\s*\)\s*\.select\(\s*'id'\s*\)/,
		);
	});
});
