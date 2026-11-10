import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import type { UserBook } from '@/lib/hooks';
import {
	ADD_OFFLINE_CODE,
	classifyShelfWriteError,
	createOwnedAdder,
	createShelfWriteScope,
} from '@/lib/shelf';
import {
	SHELF_QUEUE_BACKOFF,
	type ShelfQueueFlush,
	createShelfQueue,
	createShelfQueueRunner,
	droppedBooksNotice,
	shelfQueueBackoffMs,
} from '@/lib/shelf-queue';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const OFFLINE = { error: { code: '', message: 'TypeError: Network request failed' }, status: 0 };
const OK = { error: null, status: 200 };
const key = (userId: string) => `shelfQueue:v1:${userId}`;

function memoryStorage() {
	const map = new Map<string, string>();
	return {
		map,
		getItem: vi.fn(async (k: string) => map.get(k) ?? null),
		setItem: vi.fn(async (k: string, v: string) => {
			map.set(k, v);
		}),
		removeItem: vi.fn(async (k: string) => {
			map.delete(k);
		}),
		getAllKeys: vi.fn(async () => [...map.keys()]),
		multiRemove: vi.fn(async (keys: readonly string[]) => {
			for (const k of keys) map.delete(k);
		}),
	};
}

function setup(sessionUser: string | null = 'A') {
	const storage = memoryStorage();
	const session = { user: sessionUser };
	const addOwnedBooks = vi.fn(
		async (
			_ids: string[],
		): Promise<{ error: { code?: string; message: string } | null; status: number }> => OK,
	);
	const sessionUserId = vi.fn(async () => session.user);
	let clock = 0;
	const queue = createShelfQueue({
		storage: storage as never,
		addOwnedBooks,
		sessionUserId,
		now: () => ++clock,
		random: () => 0.5,
	});
	const stored = (userId: string) => JSON.parse(storage.map.get(key(userId)) ?? '[]');
	const bookIds = (userId: string) => stored(userId).map((op: { bookId: string }) => op.bookId);
	return { storage, session, addOwnedBooks, sessionUserId, queue, stored, bookIds };
}

describe('classifyShelfWriteError', () => {
	it.each([
		['fetch failure (status 0)', { code: '', message: 'TypeError: x' }, 0],
		['bad gateway', { message: 'x' }, 502],
		['service unavailable', { code: 'PGRST001', message: 'x' }, 503],
		['gateway timeout', { message: 'x' }, 504],
		['captive portal 511', { message: '<html>sign in</html>' }, 511],
		['Cloudflare 520', { message: '<html></html>' }, 520],
		['Cloudflare 522', { message: '<html></html>' }, 522],
		['Cloudflare 524', { message: '<html></html>' }, 524],
		['Cloudflare 530', { message: '<html></html>' }, 530],
		['thrown network error', { message: 'Network request failed' }, undefined],
	] as const)('%s is connectivity', (_name, error, status) => {
		expect(classifyShelfWriteError(error, status)).toBe('connectivity');
	});

	it.each([
		['expired JWT', { code: 'PGRST301', message: 'JWT expired' }, 401],
		['anon role', { code: 'PGRST302', message: 'x' }, 401],
		['RLS for the anon role', { code: '42501', message: 'denied' }, 401],
		['401 with no code', { message: '<html></html>' }, 401],
	] as const)('%s is auth', (_name, error, status) => {
		expect(classifyShelfWriteError(error, status)).toBe('auth');
	});

	it.each([
		['RLS', { code: '42501', message: 'row-level security' }, 403],
		['bad uuid', { code: '22P02', message: 'invalid input' }, 400],
		['missing book', { code: '23503', message: 'foreign key' }, 409],
		['not-null violation', { code: '23502', message: 'null value' }, 400],
	] as const)('%s is rejected', (_name, error, status) => {
		expect(classifyShelfWriteError(error, status)).toBe('rejected');
	});

	it.each([
		['statement timeout', { code: '57014', message: 'timeout' }, 500],
		['500 with no code', { message: 'Internal Server Error' }, 500],
		['429 rate limit', { message: 'Too Many Requests' }, 429],
		['408 request timeout', { message: 'Request Timeout' }, 408],
		['portal 403 HTML', { message: '<html>log in to wifi</html>' }, 403],
		['404 with no code', { message: 'Not Found' }, 404],
		['unknown PostgREST code', { code: 'PGRST202', message: 'x' }, 404],
		['unknown throw', { message: 'boom' }, undefined],
		['no error detail', null, undefined],
	] as const)('%s is retryable', (_name, error, status) => {
		expect(classifyShelfWriteError(error, status)).toBe('retryable');
	});
});

describe('droppedBooksNotice', () => {
	const titles: Record<string, string> = { a: 'Thrawn', b: 'Bloodline', c: 'Kenobi', d: 'Tarkin' };
	const titleOf = (id: string) => titles[id];

	it('names a single book', () => {
		expect(droppedBooksNotice(['a'], titleOf)).toEqual({
			title: "Couldn't add 1 book",
			message: "Thrawn wasn't added to Owned.",
		});
	});

	it('names up to three, then counts the rest', () => {
		expect(droppedBooksNotice(['a', 'b', 'c', 'd'], titleOf)).toEqual({
			title: "Couldn't add 4 books",
			message: "Thrawn, Bloodline, Kenobi and 1 more weren't added to Owned.",
		});
	});

	it('counts titles it cannot find', () => {
		expect(droppedBooksNotice(['a', 'gone'], titleOf).message).toBe(
			"Thrawn and 1 more weren't added to Owned.",
		);
	});

	it('falls back to the count when no title is known', () => {
		expect(droppedBooksNotice(['x', 'y'], () => undefined)).toEqual({
			title: "Couldn't add 2 books",
			message: "They weren't added to Owned.",
		});
	});
});

describe('createOwnedAdder failure codes', () => {
	const adder = (result: { error: { code?: string; message: string } | null; status?: number }) =>
		createOwnedAdder({
			current: () => new Map<string, UserBook>(),
			update: () => {},
			rpc: async () => ({ rows: null, ...result }),
			writes: createShelfWriteScope()('A'),
			isCurrentUser: () => true,
		});

	it('marks a connectivity failure as offline', async () => {
		expect(await adder(OFFLINE)(['b1'], 'A')).toMatchObject({
			ok: false,
			error: { code: ADD_OFFLINE_CODE },
		});
	});

	it.each([
		['RLS', { code: '42501', message: 'denied' }, 403],
		['a 500', { code: '57014', message: 'timeout' }, 500],
		['a 429', { message: 'Too Many Requests' }, 429],
		['a portal 403', { message: '<html></html>' }, 403],
		['a 401', { code: 'PGRST301', message: 'JWT expired' }, 401],
	] as const)(
		'keeps add_failed for %s, so Add blocks and keeps the draft',
		async (_n, error, status) => {
			expect(await adder({ error, status })(['b1'], 'A')).toMatchObject({
				ok: false,
				error: { code: 'add_failed' },
			});
		},
	);
});

describe('enqueue', () => {
	it('collapses duplicates within a batch and across batches', async () => {
		const { queue, bookIds } = setup();
		await queue.enqueue('A', ['b1', 'b1', 'b2']);
		await queue.enqueue('A', ['b2', 'b3']);
		expect(bookIds('A')).toEqual(['b1', 'b2', 'b3']);
	});

	it('does not lose ops when enqueues race', async () => {
		const { queue, bookIds } = setup();
		await Promise.all([queue.enqueue('A', ['b1']), queue.enqueue('A', ['b2'])]);
		expect(bookIds('A').sort()).toEqual(['b1', 'b2']);
	});

	it('resolves false when storage fails, so the caller keeps the draft', async () => {
		const { queue, storage } = setup();
		storage.setItem.mockRejectedValueOnce(new Error('disk full'));
		await expect(queue.enqueue('A', ['b1'])).resolves.toBe(false);
	});
});

describe('flush', () => {
	it('sends oldest first, clears on success, and is idle when empty', async () => {
		const { queue, addOwnedBooks, storage } = setup();
		await queue.enqueue('A', ['b1']);
		await queue.enqueue('A', ['b2']);
		expect(await queue.flush('A')).toEqual({ sent: 2, dropped: [], retryInMs: null });
		expect(addOwnedBooks).toHaveBeenCalledWith(['b1', 'b2']);
		expect(storage.map.has(key('A'))).toBe(false);
		expect(await queue.flush('A')).toEqual({ sent: 0, dropped: [], retryInMs: null });
		expect(addOwnedBooks).toHaveBeenCalledTimes(1);
	});

	it('mutex: concurrent flushes share one request', async () => {
		const { queue, addOwnedBooks } = setup();
		await queue.enqueue('A', ['b1']);
		let release = (_value: typeof OK) => {};
		addOwnedBooks.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const first = queue.flush('A');
		const second = queue.flush('A');
		await vi.waitFor(() => expect(addOwnedBooks).toHaveBeenCalledTimes(1));
		release(OK);
		expect(await first).toEqual(await second);
		expect(addOwnedBooks).toHaveBeenCalledTimes(1);
	});

	it('keeps a book enqueued while a request is in flight', async () => {
		const { queue, addOwnedBooks, bookIds } = setup();
		await queue.enqueue('A', ['b1']);
		let release = (_value: typeof OK) => {};
		addOwnedBooks.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const flushing = queue.flush('A');
		await vi.waitFor(() => expect(addOwnedBooks).toHaveBeenCalled());
		await queue.enqueue('A', ['b2']);
		release(OK);
		const outcome = await flushing;
		expect(outcome.sent).toBe(1);
		expect(outcome.retryInMs).not.toBeNull();
		expect(bookIds('A')).toEqual(['b2']);
	});

	it('connectivity failure keeps ops, counts the attempt, and backs off further each time', async () => {
		const { queue, addOwnedBooks, stored } = setup();
		await queue.enqueue('A', ['b1']);
		addOwnedBooks.mockResolvedValue(OFFLINE);
		const first = await queue.flush('A');
		const second = await queue.flush('A');
		expect(first.retryInMs).toBe(shelfQueueBackoffMs(0, () => 0.5));
		expect(second.retryInMs).toBe(shelfQueueBackoffMs(1, () => 0.5));
		expect(stored('A')[0].attempts).toBe(2);
	});

	it('never drops on connectivity, however long the device stays offline', async () => {
		const { queue, addOwnedBooks, bookIds } = setup();
		await queue.enqueue('A', ['b1']);
		addOwnedBooks.mockResolvedValue(OFFLINE);
		for (let i = 0; i < 20; i += 1) await queue.flush('A');
		expect(bookIds('A')).toEqual(['b1']);
	});

	it.each([
		['500', { code: '57014', message: 'timeout' }, 500],
		['429', { message: 'Too Many Requests' }, 429],
		['408', { message: 'Request Timeout' }, 408],
		['Cloudflare 522', { message: '<html></html>' }, 522],
		['portal 403 HTML', { message: '<html></html>' }, 403],
		['portal 511 HTML', { message: '<html></html>' }, 511],
		['unknown 418', { message: 'teapot' }, 418],
	] as const)('%s keeps a multi-book batch and backs off', async (_name, error, status) => {
		const { queue, addOwnedBooks, bookIds } = setup();
		await queue.enqueue('A', ['b1', 'b2']);
		addOwnedBooks.mockResolvedValue({ error, status });
		const outcome = await queue.flush('A');
		expect(outcome).toEqual({
			sent: 0,
			dropped: [],
			retryInMs: shelfQueueBackoffMs(0, () => 0.5),
		});
		expect(addOwnedBooks).toHaveBeenCalledTimes(1); // no split pass
		expect(bookIds('A')).toEqual(['b1', 'b2']);
	});

	it('a rejected batch is split, so one bad id does not sink the rest', async () => {
		const { queue, addOwnedBooks, storage } = setup();
		await queue.enqueue('A', ['good', 'bad']);
		addOwnedBooks.mockImplementation(async (ids) =>
			ids.includes('bad') ? { error: { code: '23503', message: 'fk' }, status: 409 } : OK,
		);
		expect(await queue.flush('A')).toEqual({ sent: 1, dropped: ['bad'], retryInMs: null });
		expect(storage.map.has(key('A'))).toBe(false);
	});

	it('a transient failure during the split keeps the unsettled books', async () => {
		const { queue, addOwnedBooks, bookIds } = setup();
		await queue.enqueue('A', ['bad', 'b2']);
		const rejected = { error: { code: '23503', message: 'fk' }, status: 409 };
		addOwnedBooks
			.mockResolvedValueOnce(rejected)
			.mockResolvedValueOnce(rejected)
			.mockResolvedValueOnce({ error: { message: 'oops' }, status: 500 });
		const outcome = await queue.flush('A');
		expect(outcome.dropped).toEqual(['bad']);
		expect(outcome.retryInMs).not.toBeNull();
		expect(bookIds('A')).toEqual(['b2']);
	});

	it('a rejected op is dropped and reported, with no retry (no infinite loop)', async () => {
		const { queue, addOwnedBooks, storage } = setup();
		await queue.enqueue('A', ['b1']);
		addOwnedBooks.mockResolvedValue({ error: { code: '42501', message: 'denied' }, status: 403 });
		expect(await queue.flush('A')).toEqual({ sent: 0, dropped: ['b1'], retryInMs: null });
		expect(storage.map.has(key('A'))).toBe(false);
	});

	it('a rejected op is not reported as dropped until storage confirms the removal', async () => {
		const { queue, addOwnedBooks, storage, bookIds } = setup();
		await queue.enqueue('A', ['b1']);
		addOwnedBooks.mockResolvedValue({ error: { code: '42501', message: 'denied' }, status: 403 });
		storage.removeItem.mockRejectedValueOnce(new Error('disk'));
		const outcome = await queue.flush('A');
		expect(outcome.dropped).toEqual([]);
		expect(outcome.retryInMs).not.toBeNull();
		expect(bookIds('A')).toEqual(['b1']);
	});

	it('auth failure keeps the ops with no timer, however many times it repeats', async () => {
		const { queue, addOwnedBooks, bookIds } = setup();
		await queue.enqueue('A', ['b1', 'b2']);
		addOwnedBooks.mockResolvedValue({ error: { message: 'JWT expired' }, status: 401 });
		for (let i = 0; i < 20; i += 1) {
			expect(await queue.flush('A')).toEqual({ sent: 0, dropped: [], retryInMs: null });
		}
		expect(addOwnedBooks).toHaveBeenCalledTimes(20); // no split pass
		expect(bookIds('A')).toEqual(['b1', 'b2']);
	});
});

describe('backoff', () => {
	const { baseMs, maxMs } = SHELF_QUEUE_BACKOFF;

	it('doubles per attempt and stays within the jitter band', () => {
		expect(shelfQueueBackoffMs(0, () => 0)).toBe(baseMs / 2);
		expect(shelfQueueBackoffMs(0, () => 1)).toBe(baseMs);
		expect(shelfQueueBackoffMs(1, () => 1)).toBe(baseMs * 2);
		expect(shelfQueueBackoffMs(3, () => 1)).toBe(baseMs * 8);
	});

	it('caps the delay, even for absurd attempt counts', () => {
		expect(shelfQueueBackoffMs(50, () => 1)).toBe(maxMs);
		expect(shelfQueueBackoffMs(100_000, () => 1)).toBe(maxMs);
	});
});

describe('user scoping', () => {
	it('never sends a queue under another session', async () => {
		const { queue, addOwnedBooks, session, bookIds } = setup();
		await queue.enqueue('A', ['b1']);
		session.user = 'B';
		expect(await queue.flush('A')).toEqual({ sent: 0, dropped: [], retryInMs: null });
		expect(addOwnedBooks).not.toHaveBeenCalled();
		expect(bookIds('A')).toEqual(['b1']);
	});

	it('never sends when signed out', async () => {
		const { queue, addOwnedBooks, session } = setup();
		await queue.enqueue('A', ['b1']);
		session.user = null;
		await queue.flush('A');
		expect(addOwnedBooks).not.toHaveBeenCalled();
	});

	it('stops mid-split when the session changes', async () => {
		const { queue, addOwnedBooks, session } = setup();
		await queue.enqueue('A', ['b1', 'b2']);
		addOwnedBooks.mockImplementationOnce(async () => {
			session.user = 'B';
			return { error: { message: 'denied' }, status: 403 };
		});
		await queue.flush('A');
		expect(addOwnedBooks).toHaveBeenCalledTimes(1);
	});

	it('keeps retrying when the session cannot be read (expired token, offline)', async () => {
		const { queue, sessionUserId, addOwnedBooks, bookIds } = setup();
		await queue.enqueue('A', ['b1']);
		sessionUserId.mockRejectedValueOnce(new Error('refresh failed'));
		const outcome = await queue.flush('A');
		expect(outcome.retryInMs).not.toBeNull();
		expect(addOwnedBooks).not.toHaveBeenCalled();
		expect(bookIds('A')).toEqual(['b1']);
	});

	it('ignores ops in a key whose owner field names someone else', async () => {
		const { queue, storage, addOwnedBooks } = setup();
		const foreign = { type: 'add_owned', userId: 'B', bookId: 'b1', attempts: 0, createdAt: 1 };
		storage.map.set(key('A'), JSON.stringify([foreign]));
		await queue.flush('A');
		expect(addOwnedBooks).not.toHaveBeenCalled();
	});

	it('clearAll removes every queue and leaves other app keys alone', async () => {
		const { queue, storage } = setup();
		await queue.enqueue('A', ['b1']);
		await queue.enqueue('B', ['b2']);
		storage.map.set('pendingAppleName', 'Luke');
		await queue.clearAll();
		expect([...storage.map.keys()]).toEqual(['pendingAppleName']);
	});

	it('purgeOtherUsers keeps only the current account', async () => {
		const { queue, storage } = setup();
		await queue.enqueue('A', ['b1']);
		await queue.enqueue('B', ['b2']);
		await queue.purgeOtherUsers('B');
		expect([...storage.map.keys()]).toEqual([key('B')]);
	});

	it('a sign-out during a request does not resurrect the cleared queue', async () => {
		const { queue, addOwnedBooks, storage } = setup();
		await queue.enqueue('A', ['b1']);
		let release = (_value: typeof OFFLINE) => {};
		addOwnedBooks.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const flushing = queue.flush('A');
		await vi.waitFor(() => expect(addOwnedBooks).toHaveBeenCalled());
		await queue.clearAll();
		release(OFFLINE);
		await flushing;
		expect(storage.map.has(key('A'))).toBe(false);
	});
});

describe('corrupt storage', () => {
	it.each([
		['invalid JSON', '{not json'],
		['wrong top-level shape', '{"ops":[]}'],
		['null literal', 'null'],
	])('%s: flush is idle and the value is removed', async (_name, raw) => {
		const { queue, storage, addOwnedBooks } = setup();
		storage.map.set(key('A'), raw);
		expect(await queue.flush('A')).toEqual({ sent: 0, dropped: [], retryInMs: null });
		expect(addOwnedBooks).not.toHaveBeenCalled();
		expect(storage.map.has(key('A'))).toBe(false);
	});

	it('keeps the valid ops around malformed ones', async () => {
		const { queue, storage, addOwnedBooks } = setup();
		const good = { type: 'add_owned', userId: 'A', bookId: 'b1', attempts: 0, createdAt: 1 };
		storage.map.set(key('A'), JSON.stringify([null, 3, { bookId: 'x' }, good, good]));
		await queue.flush('A');
		expect(addOwnedBooks).toHaveBeenCalledWith(['b1']);
	});

	it('enqueue recovers over corrupt data', async () => {
		const { queue, storage, bookIds } = setup();
		storage.map.set(key('A'), '%%%');
		await expect(queue.enqueue('A', ['b1'])).resolves.toBe(true);
		expect(bookIds('A')).toEqual(['b1']);
	});

	it('flush does not reject when storage throws, and retries', async () => {
		const { queue, storage } = setup();
		storage.getItem.mockRejectedValueOnce(new Error('unavailable'));
		const outcome = await queue.flush('A');
		expect(outcome.sent).toBe(0);
		expect(outcome.retryInMs).not.toBeNull();
	});
});

describe('createShelfQueueRunner', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	function fakeQueue(outcomes: ShelfQueueFlush[]) {
		let listener: (userId: string) => void = () => {};
		const flush = vi.fn(async () => outcomes.shift() ?? { sent: 0, dropped: [], retryInMs: null });
		const unsubscribe = vi.fn();
		const subscribe = (l: (userId: string) => void) => {
			listener = l;
			return unsubscribe;
		};
		return { flush, subscribe, unsubscribe, enqueued: (id: string) => listener(id) };
	}

	it('re-arms from retryInMs while the queue is non-empty, then stops', async () => {
		const queue = fakeQueue([{ sent: 0, dropped: [], retryInMs: 1000 }]);
		const runner = createShelfQueueRunner({
			queue,
			userId: 'A',
			onSynced: () => {},
			onDropped: () => {},
		});
		runner.trigger();
		await vi.advanceTimersByTimeAsync(999);
		expect(queue.flush).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(queue.flush).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(queue.flush).toHaveBeenCalledTimes(2); // retryInMs null ends the loop
	});

	it('an enqueue arms the timer without an immediate flush', async () => {
		const queue = fakeQueue([]);
		createShelfQueueRunner({ queue, userId: 'A', onSynced: () => {}, onDropped: () => {} });
		queue.enqueued('A');
		expect(queue.flush).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(SHELF_QUEUE_BACKOFF.baseMs);
		expect(queue.flush).toHaveBeenCalledTimes(1);
	});

	it("ignores another user's enqueue", async () => {
		const queue = fakeQueue([]);
		createShelfQueueRunner({ queue, userId: 'A', onSynced: () => {}, onDropped: () => {} });
		queue.enqueued('B');
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(queue.flush).not.toHaveBeenCalled();
	});

	it('an enqueue during an idle flush still gets a retry', async () => {
		const queue = fakeQueue([]);
		const runner = createShelfQueueRunner({
			queue,
			userId: 'A',
			onSynced: () => {},
			onDropped: () => {},
		});
		runner.trigger();
		queue.enqueued('A');
		await vi.advanceTimersByTimeAsync(SHELF_QUEUE_BACKOFF.baseMs);
		expect(queue.flush).toHaveBeenCalledTimes(2);
	});

	it('reports a sync only when books were sent', async () => {
		const queue = fakeQueue([
			{ sent: 0, dropped: [], retryInMs: null },
			{ sent: 2, dropped: [], retryInMs: null },
		]);
		const onSynced = vi.fn();
		const runner = createShelfQueueRunner({ queue, userId: 'A', onSynced, onDropped: () => {} });
		runner.trigger();
		await vi.advanceTimersByTimeAsync(0);
		expect(onSynced).not.toHaveBeenCalled();
		runner.trigger();
		await vi.advanceTimersByTimeAsync(0);
		expect(onSynced).toHaveBeenCalledTimes(1);
	});

	it('reports dropped books once, and not after stop', async () => {
		const queue = fakeQueue([
			{ sent: 0, dropped: ['b1'], retryInMs: null },
			{ sent: 0, dropped: [], retryInMs: null },
			{ sent: 0, dropped: ['b2'], retryInMs: null },
		]);
		const onDropped = vi.fn();
		const runner = createShelfQueueRunner({ queue, userId: 'A', onSynced: () => {}, onDropped });
		runner.trigger();
		await vi.advanceTimersByTimeAsync(0);
		runner.trigger();
		await vi.advanceTimersByTimeAsync(0);
		expect(onDropped).toHaveBeenCalledTimes(1);
		expect(onDropped).toHaveBeenCalledWith(['b1']);
		runner.trigger();
		runner.stop();
		await vi.advanceTimersByTimeAsync(0);
		expect(onDropped).toHaveBeenCalledTimes(1);
	});

	it('a trigger while running does not start a second flush', async () => {
		const queue = fakeQueue([]);
		const runner = createShelfQueueRunner({
			queue,
			userId: 'A',
			onSynced: () => {},
			onDropped: () => {},
		});
		runner.trigger();
		runner.trigger();
		await vi.advanceTimersByTimeAsync(0);
		expect(queue.flush).toHaveBeenCalledTimes(1);
	});

	it('stop cancels the timer and silences a flush still in flight', async () => {
		const queue = fakeQueue([{ sent: 3, dropped: [], retryInMs: 1000 }]);
		const onSynced = vi.fn();
		const runner = createShelfQueueRunner({ queue, userId: 'A', onSynced, onDropped: () => {} });
		runner.trigger();
		runner.stop();
		await vi.advanceTimersByTimeAsync(10 * 60_000);
		expect(onSynced).not.toHaveBeenCalled();
		expect(queue.flush).toHaveBeenCalledTimes(1);
		expect(queue.unsubscribe).toHaveBeenCalledTimes(1);
		runner.trigger();
		expect(queue.flush).toHaveBeenCalledTimes(1);
	});
});
