import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	signOut: vi.fn(),
	removeSession: vi.fn(),
	clearAll: vi.fn(),
}));

vi.mock('./supabase', () => ({
	supabase: { auth: { signOut: mocks.signOut, _removeSession: mocks.removeSession } },
}));
vi.mock('./shelf-queue', () => ({ shelfQueue: { clearAll: mocks.clearAll } }));
vi.mock('./auth', () => ({ requestAppleCredential: vi.fn() }));

import { signOut } from './account';

const offline = () => new AuthRetryableFetchError('Network request failed', 0);

/** Default-scope (global) calls carry no options; the local fallback passes `{ scope: 'local' }`. */
const isLocal = (opts: unknown) => (opts as { scope?: string } | undefined)?.scope === 'local';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.clearAll.mockResolvedValue(undefined);
	mocks.removeSession.mockResolvedValue(undefined);
	mocks.signOut.mockImplementation(async (opts?: unknown) =>
		isLocal(opts) ? { error: null } : { error: offline() },
	);
});

describe('signOut', () => {
	it('falls back to a local sign-out when the global revoke returns a network error', async () => {
		expect(await signOut()).toEqual({ error: null });
		expect(mocks.signOut).toHaveBeenCalledTimes(2);
		expect(mocks.signOut.mock.calls[0]).toEqual([]);
		expect(mocks.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
		expect(mocks.clearAll).toHaveBeenCalledTimes(1);
	});

	it('falls back to a local sign-out when the global revoke throws', async () => {
		mocks.signOut.mockImplementation(async (opts?: unknown) => {
			if (isLocal(opts)) return { error: null };
			throw new TypeError('Network request failed');
		});
		expect(await signOut()).toEqual({ error: null });
		expect(mocks.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
		expect(mocks.clearAll).toHaveBeenCalledTimes(1);
	});

	it('clears the stored session offline even though the local scope also posts /logout', async () => {
		// auth-js 2.103 sends the revoke for scope 'local' too, and returns before clearing.
		mocks.signOut.mockResolvedValue({ error: offline() });
		expect(await signOut()).toEqual({ error: null });
		expect(mocks.removeSession).toHaveBeenCalledTimes(1);
		expect(mocks.clearAll).toHaveBeenCalledTimes(1);
	});

	it('returns an error only when the local clear also fails', async () => {
		mocks.signOut.mockResolvedValue({ error: offline() });
		mocks.removeSession.mockRejectedValue(new Error('storage unavailable'));
		const { error } = await signOut();
		expect(error).toBeInstanceOf(Error);
		expect(error?.message).toBe('storage unavailable');
	});

	it('returns an error when clearing the shelf queue fails on the fallback path', async () => {
		mocks.clearAll.mockRejectedValue(new Error('queue locked'));
		const { error } = await signOut();
		expect(error?.message).toBe('queue locked');
	});

	it('online: one global revoke with the default scope, then clears the queue, no fallback', async () => {
		mocks.signOut.mockResolvedValue({ error: null });
		expect(await signOut()).toEqual({ error: null });
		expect(mocks.signOut).toHaveBeenCalledTimes(1);
		expect(mocks.signOut.mock.calls[0]).toEqual([]);
		expect(mocks.clearAll).toHaveBeenCalledTimes(1);
		expect(mocks.removeSession).not.toHaveBeenCalled();
	});

	it('falls back on a non-network auth error too (e.g. 500 from /logout)', async () => {
		mocks.signOut.mockImplementation(async (opts?: unknown) =>
			isLocal(opts) ? { error: null } : { error: new AuthApiError('boom', 500, undefined) },
		);
		expect(await signOut()).toEqual({ error: null });
		expect(mocks.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
	});
});

describe('profile sign-out wiring', () => {
	const profile = readFileSync(resolve(__dirname, '..', 'app/profile.tsx'), 'utf8');

	it('imports and calls the account signOut helper', () => {
		expect(profile).toMatch(/import\s*\{[^}]*\bsignOut\b[^}]*\}\s*from\s*'@\/lib\/account'/);
		expect(profile).toMatch(/const\s*\{\s*error\s*\}\s*=\s*await\s+signOut\(\s*\)/);
		expect(profile).toMatch(
			/if\s*\(\s*error\s*\)\s*Alert\.alert\(\s*'Sign-out failed',\s*error\.message\s*\)/,
		);
	});

	it('no longer calls supabase.auth.signOut directly', () => {
		expect(profile).not.toMatch(/supabase\.auth\.signOut\(/);
	});
});
