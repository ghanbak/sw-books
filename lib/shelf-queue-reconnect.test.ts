import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type State = { isConnected: boolean | null; isInternetReachable: boolean | null };

const netInfo = vi.hoisted(() => {
	let listener: ((state: State) => void) | null = null;
	const unsubscribe = vi.fn(() => {
		listener = null;
	});
	const addEventListener = vi.fn((l: (state: State) => void) => {
		listener = l;
		return unsubscribe;
	});
	return {
		addEventListener,
		unsubscribe,
		emit: (state: State) => listener?.(state),
	};
});

vi.mock('@react-native-community/netinfo', () => ({
	default: { addEventListener: netInfo.addEventListener },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { connectivityOf, isReconnect, subscribeToReconnect } from '@/lib/connectivity';
import { type ShelfQueueFlush, createShelfQueueRunner } from '@/lib/shelf-queue';

const ONLINE: State = { isConnected: true, isInternetReachable: true };
const OFFLINE: State = { isConnected: false, isInternetReachable: false };
const UNKNOWN: State = { isConnected: null, isInternetReachable: null };

describe('connectivity transitions', () => {
	it('classifies NetInfo states', () => {
		expect(connectivityOf(ONLINE)).toBe('online');
		expect(connectivityOf({ isConnected: true, isInternetReachable: null })).toBe('online');
		expect(connectivityOf({ isConnected: true, isInternetReachable: false })).toBe('offline');
		expect(connectivityOf(OFFLINE)).toBe('offline');
		expect(connectivityOf(UNKNOWN)).toBe('unknown');
	});

	it('only offline → online is a reconnect', () => {
		expect(isReconnect('offline', 'online')).toBe(true);
		expect(isReconnect('online', 'online')).toBe(false);
		expect(isReconnect('online', 'offline')).toBe(false);
		expect(isReconnect(null, 'online')).toBe(false);
	});
});

describe('subscribeToReconnect (mocked NetInfo)', () => {
	beforeEach(() => {
		netInfo.addEventListener.mockClear();
		netInfo.unsubscribe.mockClear();
	});

	it('offline → online fires exactly once', () => {
		const onReconnect = vi.fn();
		subscribeToReconnect(onReconnect);
		netInfo.emit(OFFLINE);
		netInfo.emit(ONLINE);
		expect(onReconnect).toHaveBeenCalledTimes(1);
	});

	it('online → online fires nothing, including the initial report', () => {
		const onReconnect = vi.fn();
		subscribeToReconnect(onReconnect);
		netInfo.emit(ONLINE);
		netInfo.emit(ONLINE);
		netInfo.emit({ isConnected: true, isInternetReachable: null });
		expect(onReconnect).not.toHaveBeenCalled();
	});

	it('an unknown state in between keeps the last known value', () => {
		const onReconnect = vi.fn();
		subscribeToReconnect(onReconnect);
		netInfo.emit(OFFLINE);
		netInfo.emit(UNKNOWN);
		netInfo.emit(ONLINE);
		netInfo.emit(UNKNOWN);
		netInfo.emit(ONLINE);
		expect(onReconnect).toHaveBeenCalledTimes(1);
	});

	it('returns the NetInfo unsubscribe', () => {
		const onReconnect = vi.fn();
		const unsubscribe = subscribeToReconnect(onReconnect);
		unsubscribe();
		expect(netInfo.unsubscribe).toHaveBeenCalledTimes(1);
		netInfo.emit(OFFLINE);
		netInfo.emit(ONLINE);
		expect(onReconnect).not.toHaveBeenCalled();
	});
});

describe('createShelfQueueRunner.reconnect', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	const failing: ShelfQueueFlush = { sent: 0, dropped: [], retryInMs: 60_000 };
	const idle: ShelfQueueFlush = { sent: 0, dropped: [], retryInMs: null };

	function setup(outcomes: ShelfQueueFlush[], pending?: Promise<void>) {
		const flush = vi.fn(async () => {
			if (pending) await pending;
			return outcomes.shift() ?? idle;
		});
		const queue = { flush, subscribe: () => () => {} };
		const runner = createShelfQueueRunner({
			queue,
			userId: 'A',
			onSynced: () => {},
			onDropped: () => {},
		});
		return { flush, runner };
	}

	it('an offline → online event flushes exactly once, end to end', async () => {
		const { flush, runner } = setup([]);
		subscribeToReconnect(runner.reconnect);
		netInfo.emit(ONLINE); // initial report
		netInfo.emit(OFFLINE);
		netInfo.emit(ONLINE);
		await vi.advanceTimersByTimeAsync(0);
		expect(flush).toHaveBeenCalledTimes(1);
		netInfo.emit(ONLINE);
		await vi.advanceTimersByTimeAsync(0);
		expect(flush).toHaveBeenCalledTimes(1);
	});

	it('flushes now instead of waiting for the backoff timer', async () => {
		const { flush, runner } = setup([failing]);
		runner.trigger();
		await vi.advanceTimersByTimeAsync(0);
		expect(flush).toHaveBeenCalledTimes(1);
		runner.reconnect();
		await vi.advanceTimersByTimeAsync(0);
		expect(flush).toHaveBeenCalledTimes(2);
	});

	it('a flapping connection gets one early flush per backoff step', async () => {
		const { flush, runner } = setup([failing, failing, failing, failing]);
		runner.trigger();
		await vi.advanceTimersByTimeAsync(0);
		runner.reconnect();
		await vi.advanceTimersByTimeAsync(0);
		expect(flush).toHaveBeenCalledTimes(2);
		for (let i = 0; i < 5; i++) {
			runner.reconnect();
			await vi.advanceTimersByTimeAsync(1_000);
		}
		expect(flush).toHaveBeenCalledTimes(2); // backoff still governs
		await vi.advanceTimersByTimeAsync(60_000);
		expect(flush).toHaveBeenCalledTimes(3); // the timer fires and re-arms
		runner.reconnect();
		await vi.advanceTimersByTimeAsync(0);
		expect(flush).toHaveBeenCalledTimes(4);
	});

	it('a reconnect during a flush does not start a second one', async () => {
		let release = () => {};
		const pending = new Promise<void>((done) => {
			release = done;
		});
		const { flush, runner } = setup([idle], pending);
		runner.trigger();
		runner.reconnect();
		runner.reconnect();
		expect(flush).toHaveBeenCalledTimes(1);
		release();
		await vi.advanceTimersByTimeAsync(0);
		expect(flush).toHaveBeenCalledTimes(1); // the run succeeded, nothing to retry
	});

	it('a reconnect during a flush that then fails retries once, right away', async () => {
		let release = () => {};
		const pending = new Promise<void>((done) => {
			release = done;
		});
		const { flush, runner } = setup([failing, failing], pending);
		runner.trigger();
		runner.reconnect();
		runner.reconnect();
		release();
		await vi.advanceTimersByTimeAsync(0);
		expect(flush).toHaveBeenCalledTimes(2);
		runner.reconnect();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(flush).toHaveBeenCalledTimes(2); // that retry spent this step's reconnect
	});

	it('stop silences reconnects', async () => {
		const { flush, runner } = setup([]);
		runner.stop();
		runner.reconnect();
		await vi.advanceTimersByTimeAsync(0);
		expect(flush).not.toHaveBeenCalled();
	});
});

describe('shelf queue sync wiring (reconnect)', () => {
	const sync = readFileSync(resolve(__dirname, '..', 'components/shelf-queue-sync.tsx'), 'utf8');

	it('subscribes the runner to reconnects', () => {
		expect(sync).toMatch(/import \{ subscribeToReconnect \} from '@\/lib\/connectivity'/);
		expect(sync).toMatch(
			/const unsubscribeNetInfo = subscribeToReconnect\(\s*runner\.reconnect\s*\)/,
		);
	});

	it('removes the listener in the effect cleanup, which runs on sign-out', () => {
		expect(sync).toMatch(/return \(\) => \{[^}]*unsubscribeNetInfo\(\);[^}]*runner\.stop\(\);/);
		expect(sync).toMatch(/if \(!userId\) return;/);
		expect(sync).toMatch(/\}, \[userId\]\);/);
	});
});
