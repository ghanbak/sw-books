import { beforeEach, describe, expect, it, vi } from 'vitest';

// No hook-render harness in this repo (node environment, no @testing-library): stub React's
// hooks so `useCatalogSort` runs as a plain function and its mount effect can be driven by hand.
const react = vi.hoisted(() => ({
	setSort: null as unknown as (v: unknown) => void,
	effect: null as null | (() => undefined | (() => void)),
}));

vi.mock('react', () => ({
	useState: (initial: unknown) => [initial, react.setSort],
	useRef: (initial: unknown) => ({ current: initial }),
	useEffect: (fn: () => undefined | (() => void)) => {
		react.effect = fn;
	},
	useCallback: (fn: unknown) => fn,
}));

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

import { useCatalogSort } from '@/hooks/useCatalogSort';
import { DEFAULT_SORT } from '@/lib/sort';

const nativeThen = Promise.prototype.then;

/**
 * Wraps `root` so every promise the hook derives from it (`.then`, `.catch`) is observed. A
 * derived promise the hook never chains onto is a leaf; if a leaf rejects, that rejection
 * would have been unhandled in the app. Observation uses the native `then` so Node itself
 * never sees an unhandled rejection (keeps old-code runs failing on assertions, not noise).
 */
function trackChain<T>(root: Promise<T>) {
	const unhandled: unknown[] = [];
	const chained = new WeakSet<Promise<unknown>>();
	const track = <U>(p: Promise<U>): Promise<U> => {
		nativeThen.call(p, undefined, (e) => {
			if (!chained.has(p)) unhandled.push(e);
		});
		Object.defineProperty(p, 'then', {
			value: (onOk?: never, onErr?: never) => {
				chained.add(p);
				return track(nativeThen.call(p, onOk, onErr));
			},
		});
		return p;
	};
	return { promise: track(root), unhandled };
}

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount() {
	useCatalogSort('sort:test');
	const cleanup = react.effect?.();
	return () => {
		if (typeof cleanup === 'function') cleanup();
	};
}

const PUBLISH_DESC = { field: 'date_published', direction: 'desc' } as const;

describe('useCatalogSort hydrate (#378)', () => {
	beforeEach(() => {
		react.setSort = vi.fn();
		react.effect = null;
		storage.getItem.mockReset();
		storage.setItem.mockReset();
	});

	it('applies the stored sort when the read resolves', async () => {
		storage.getItem.mockResolvedValue(JSON.stringify(PUBLISH_DESC));
		mount();
		await flush();
		expect(storage.getItem).toHaveBeenCalledWith('sort:test');
		expect(react.setSort).toHaveBeenCalledWith(PUBLISH_DESC);
	});

	it('falls back to DEFAULT_SORT with no unhandled rejection when the read rejects', async () => {
		const chain = trackChain(Promise.reject(new Error('storage I/O')));
		storage.getItem.mockReturnValue(chain.promise);
		mount();
		await flush();
		expect(chain.unhandled).toEqual([]);
		expect(react.setSort).toHaveBeenCalledWith(DEFAULT_SORT);
	});

	it('does not set state when the read resolves after unmount', async () => {
		const read = deferred<string | null>();
		storage.getItem.mockReturnValue(read.promise);
		const unmount = mount();
		unmount();
		read.resolve(JSON.stringify(PUBLISH_DESC));
		await flush();
		expect(react.setSort).not.toHaveBeenCalled();
	});

	it('does not set state when the read rejects after unmount', async () => {
		const read = deferred<string | null>();
		const chain = trackChain(read.promise);
		storage.getItem.mockReturnValue(chain.promise);
		const unmount = mount();
		unmount();
		read.reject(new Error('storage I/O'));
		await flush();
		expect(react.setSort).not.toHaveBeenCalled();
	});
});
