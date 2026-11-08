import AsyncStorage from '@react-native-async-storage/async-storage';

import { type ShelfWriteFailure, classifyShelfWriteError } from '@/lib/shelf';
import { supabase } from '@/lib/supabase';

/**
 * Offline write queue for the shelf scanner's Add (plan Decision 3). A batch that fails
 * for connectivity is parked here, one AsyncStorage key per user, and replayed through
 * the idempotent `add_owned_books` RPC. `components/shelf-queue-sync.tsx` drives flushes
 * on app start, foreground, and a backoff timer while the queue is non-empty.
 *
 * Per-user safety is layered: each user has their own key, ops carry their owner and are
 * filtered on read, and every send first checks the live session. The RPC writes for
 * `auth.uid()`, so without that check one user's books could land on another's shelf.
 */

const KEY_PREFIX = 'shelfQueue:v1:';

export const SHELF_QUEUE_BACKOFF = { baseMs: 5_000, maxMs: 5 * 60_000 } as const;

export type ShelfQueueOp = {
	type: 'add_owned';
	userId: string;
	bookId: string;
	attempts: number;
	createdAt: number;
};

export type ShelfQueueFlush = {
	/** Books the server confirmed in this flush. */
	sent: number;
	/** Book ids removed because Postgres definitely refused them. The user must be told. */
	dropped: string[];
	/** Delay before the next automatic retry; null waits for the next start/foreground. */
	retryInMs: number | null;
};

export type ShelfQueue = {
	/** Resolves false when the ops could not be stored, so the caller must not discard them. */
	enqueue: (userId: string, bookIds: string[]) => Promise<boolean>;
	/** Mutex-guarded per user: concurrent calls share one run. Never rejects. */
	flush: (userId: string) => Promise<ShelfQueueFlush>;
	/** Deliberate sign-out and account deletion: nothing queued stays on the device. */
	clearAll: () => Promise<void>;
	/** Sweep leftovers from any account other than `userId`. */
	purgeOtherUsers: (userId: string) => Promise<void>;
	subscribe: (listener: (userId: string) => void) => () => void;
};

type ShelfQueueDeps = {
	storage: Pick<
		typeof AsyncStorage,
		'getItem' | 'setItem' | 'removeItem' | 'getAllKeys' | 'multiRemove'
	>;
	addOwnedBooks: (
		bookIds: string[],
	) => Promise<{ error: { code?: string; message?: string } | null; status?: number }>;
	/** The live session's user. Resolve null when signed out; throw when it can't be read. */
	sessionUserId: () => Promise<string | null>;
	now?: () => number;
	random?: () => number;
};

/** Exponential backoff with equal jitter: half the capped delay is fixed, half is random. */
export function shelfQueueBackoffMs(attempts: number, random: () => number = Math.random): number {
	const { baseMs, maxMs } = SHELF_QUEUE_BACKOFF;
	const capped = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempts));
	return Math.round(capped / 2 + random() * (capped / 2));
}

function isOp(value: unknown): value is ShelfQueueOp {
	const op = value as Partial<ShelfQueueOp> | null;
	return (
		typeof op === 'object' &&
		op !== null &&
		op.type === 'add_owned' &&
		typeof op.userId === 'string' &&
		typeof op.bookId === 'string' &&
		op.bookId.length > 0 &&
		Number.isFinite(op.attempts) &&
		Number.isFinite(op.createdAt)
	);
}

/** Keeps every valid, unique op owned by `userId`; `dirty` means the stored value needs rewriting. */
function parseOps(raw: string | null, userId: string): { ops: ShelfQueueOp[]; dirty: boolean } {
	if (raw === null) return { ops: [], dirty: false };
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ops: [], dirty: true };
	}
	if (!Array.isArray(parsed)) return { ops: [], dirty: true };
	const seen = new Set<string>();
	const ops = parsed.filter((op): op is ShelfQueueOp => {
		if (!isOp(op) || op.userId !== userId || seen.has(op.bookId)) return false;
		seen.add(op.bookId);
		return true;
	});
	return { ops, dirty: ops.length !== parsed.length };
}

export function createShelfQueue(deps: ShelfQueueDeps): ShelfQueue {
	const { storage } = deps;
	const now = deps.now ?? Date.now;
	const random = deps.random ?? Math.random;
	const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

	// Serializes every read-modify-write, so an enqueue can't be lost to a flush's save.
	let tail: Promise<unknown> = Promise.resolve();
	const locked = <T>(fn: () => Promise<T>): Promise<T> => {
		const run = tail.then(fn);
		tail = run.catch(() => {});
		return run;
	};

	const save = async (userId: string, ops: ShelfQueueOp[]) => {
		if (ops.length === 0) await storage.removeItem(keyFor(userId));
		else await storage.setItem(keyFor(userId), JSON.stringify(ops));
	};

	const load = async (userId: string): Promise<ShelfQueueOp[]> => {
		const { ops, dirty } = parseOps(await storage.getItem(keyFor(userId)), userId);
		if (dirty) {
			if (__DEV__) console.warn('[shelf-queue] discarded unreadable stored ops');
			await save(userId, ops).catch(() => {}); // the next save retries the repair
		}
		return ops;
	};

	const listeners = new Set<(userId: string) => void>();

	const enqueue: ShelfQueue['enqueue'] = async (userId, bookIds) => {
		try {
			await locked(async () => {
				const ops = await load(userId);
				const queued = new Set(ops.map((op) => op.bookId));
				const createdAt = now();
				for (const bookId of new Set(bookIds)) {
					if (!queued.has(bookId)) {
						ops.push({ type: 'add_owned', userId, bookId, attempts: 0, createdAt });
					}
				}
				await save(userId, ops);
			});
		} catch (cause) {
			if (__DEV__) console.warn('[shelf-queue] enqueue failed:', cause);
			return false;
		}
		for (const listener of listeners) listener(userId);
		return true;
	};

	/** Null on success. Re-checks the session before every request. */
	const send = async (
		userId: string,
		ids: string[],
	): Promise<ShelfWriteFailure | 'no_session' | null> => {
		try {
			if ((await deps.sessionUserId()) !== userId) return 'no_session';
		} catch {
			// An expired token that can't refresh offline: unknown, so retry later.
			return 'connectivity';
		}
		try {
			const { error, status } = await deps.addOwnedBooks(ids);
			return error ? classifyShelfWriteError(error, status) : null;
		} catch (cause) {
			return classifyShelfWriteError(cause as { message?: string });
		}
	};

	const runFlush = async (userId: string): Promise<ShelfQueueFlush> => {
		const storageRetry = shelfQueueBackoffMs(0, random);
		let ops: ShelfQueueOp[];
		try {
			ops = await locked(() => load(userId));
		} catch {
			return { sent: 0, dropped: [], retryInMs: storageRetry };
		}
		if (ops.length === 0) return { sent: 0, dropped: [], retryInMs: null };

		const ids = [...ops].sort((a, b) => a.createdAt - b.createdAt).map((op) => op.bookId);
		const attempts = Math.max(...ops.map((op) => op.attempts));
		const confirmed: string[] = [];
		const rejected: string[] = [];

		let failure = await send(userId, ids);
		if (failure === null) {
			confirmed.push(...ids);
		} else if (failure === 'rejected' && ids.length === 1) {
			rejected.push(...ids);
		} else if (failure === 'rejected') {
			// The RPC is all-or-nothing, so one bad id would sink the batch. Find it.
			failure = null;
			for (const id of ids) {
				const single = await send(userId, [id]);
				if (single === null) confirmed.push(id);
				else if (single === 'rejected') rejected.push(id);
				else {
					failure = single;
					break;
				}
			}
		}

		const settled = new Set([...confirmed, ...rejected]);
		const tried = new Set(ids);
		const backingOff = failure === 'connectivity' || failure === 'retryable';
		let remaining = 0;
		try {
			// Re-read: ops enqueued (or cleared) while the request was in flight stay honest.
			await locked(async () => {
				const current = await load(userId);
				const next = current
					.filter((op) => !settled.has(op.bookId))
					.map((op) =>
						backingOff && tried.has(op.bookId) ? { ...op, attempts: op.attempts + 1 } : op,
					);
				await save(userId, next);
				remaining = next.length;
			});
		} catch {
			// Nothing was removed: confirmed ops replay as no-ops, rejected ones get reported then.
			return { sent: confirmed.length, dropped: [], retryInMs: storageRetry };
		}

		let retryInMs: number | null = null;
		if (backingOff) retryInMs = shelfQueueBackoffMs(attempts, random);
		else if (failure === null && remaining > 0) retryInMs = shelfQueueBackoffMs(0, random);
		return { sent: confirmed.length, dropped: rejected, retryInMs };
	};

	const inFlight = new Map<string, Promise<ShelfQueueFlush>>();
	const flush: ShelfQueue['flush'] = (userId) => {
		const running = inFlight.get(userId);
		if (running) return running;
		const run = runFlush(userId).finally(() => inFlight.delete(userId));
		inFlight.set(userId, run);
		return run;
	};

	const removeKeys = (shouldRemove: (key: string) => boolean) =>
		locked(async () => {
			const keys = await storage.getAllKeys();
			const targets = keys.filter((key) => key.startsWith(KEY_PREFIX) && shouldRemove(key));
			if (targets.length > 0) await storage.multiRemove(targets);
		}).catch((cause) => {
			if (__DEV__) console.warn('[shelf-queue] clear failed:', cause);
		});

	return {
		enqueue,
		flush,
		clearAll: () => removeKeys(() => true),
		purgeOtherUsers: (userId) => removeKeys((key) => key !== keyFor(userId)),
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

/** Alert copy for books a flush gave up on. Falls back to the count for unknown titles. */
export function droppedBooksNotice(
	bookIds: string[],
	titleOf: (bookId: string) => string | undefined,
): { title: string; message: string } {
	const count = bookIds.length;
	const shown = bookIds.flatMap((id) => titleOf(id) ?? []).slice(0, 3);
	const rest = count - shown.length;
	const fallback = count === 1 ? 'It' : 'They';
	const names = rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ');
	return {
		title: `Couldn't add ${count === 1 ? '1 book' : `${count} books`}`,
		message: `${shown.length > 0 ? names : fallback} ${count === 1 ? "wasn't" : "weren't"} added to Owned.`,
	};
}

/**
 * Flush scheduling for one signed-in user. `stop` cancels the timer and silences any
 * flush still in flight, so nothing fires after sign-out or unmount.
 */
export function createShelfQueueRunner({
	queue,
	userId,
	onSynced,
	onDropped,
}: {
	queue: Pick<ShelfQueue, 'flush' | 'subscribe'>;
	userId: string;
	onSynced: () => void;
	onDropped: (bookIds: string[]) => void;
}) {
	let stopped = false;
	let running = false;
	let enqueuedWhileRunning = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const cancel = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	};
	const schedule = (delayMs: number) => {
		cancel();
		timer = setTimeout(trigger, delayMs);
	};

	function trigger() {
		if (stopped || running) return;
		cancel();
		running = true;
		enqueuedWhileRunning = false;
		void queue.flush(userId).then((outcome) => {
			running = false;
			if (stopped) return;
			if (outcome.sent > 0) onSynced();
			if (outcome.dropped.length > 0) onDropped(outcome.dropped);
			if (outcome.retryInMs !== null) schedule(outcome.retryInMs);
			else if (enqueuedWhileRunning) schedule(SHELF_QUEUE_BACKOFF.baseMs);
		});
	}

	const unsubscribe = queue.subscribe((enqueuedFor) => {
		if (enqueuedFor !== userId || stopped) return;
		if (running) enqueuedWhileRunning = true;
		else schedule(SHELF_QUEUE_BACKOFF.baseMs);
	});

	return {
		trigger,
		stop() {
			stopped = true;
			cancel();
			unsubscribe();
		},
	};
}

/** The app's one queue: the scan hook and the sync component must share its mutex and lock. */
export const shelfQueue = createShelfQueue({
	storage: AsyncStorage,
	addOwnedBooks: async (bookIds) => {
		const { error, status } = await supabase.rpc('add_owned_books', { book_ids: bookIds });
		return { error, status };
	},
	sessionUserId: async () => {
		const { data, error } = await supabase.auth.getSession();
		if (error) throw error;
		return data.session?.user.id ?? null;
	},
});
