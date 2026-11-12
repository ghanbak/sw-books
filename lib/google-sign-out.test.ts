import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	signOut: vi.fn(),
	removeSession: vi.fn(),
	getSession: vi.fn(),
	refreshSession: vi.fn(),
	invoke: vi.fn(),
	clearAll: vi.fn(),
	google: {
		signOut: vi.fn(),
		revokeAccess: vi.fn(),
		hasPreviousSignIn: vi.fn(),
	},
}));

vi.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: mocks.google }));
vi.mock('./supabase', () => ({
	supabase: {
		auth: {
			signOut: mocks.signOut,
			_removeSession: mocks.removeSession,
			getSession: mocks.getSession,
			refreshSession: mocks.refreshSession,
		},
		functions: { invoke: mocks.invoke },
	},
}));
vi.mock('./shelf-queue', () => ({ shelfQueue: { clearAll: mocks.clearAll } }));
vi.mock('./auth', () => ({ requestAppleCredential: vi.fn() }));

import * as account from './account';

const offline = () => new AuthRetryableFetchError('Network request failed', 0);
const isLocal = (opts: unknown) => (opts as { scope?: string } | undefined)?.scope === 'local';
const never = () => new Promise<never>(() => {});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.clearAll.mockResolvedValue(undefined);
	mocks.removeSession.mockResolvedValue(undefined);
	mocks.signOut.mockResolvedValue({ error: null });
	mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'old' } } });
	mocks.refreshSession.mockResolvedValue({
		data: { session: { access_token: 'fresh' } },
		error: null,
	});
	mocks.invoke.mockResolvedValue({ data: { ok: true, appleRevoked: false }, error: null });
	mocks.google.hasPreviousSignIn.mockReturnValue(true);
	mocks.google.signOut.mockResolvedValue(null);
	mocks.google.revokeAccess.mockResolvedValue(null);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('signOut ends the native Google session', () => {
	it('online: calls GoogleSignin.signOut after the Supabase revoke', async () => {
		expect(await account.signOut()).toEqual({ error: null });
		expect(mocks.signOut).toHaveBeenCalledTimes(1);
		expect(mocks.google.signOut).toHaveBeenCalledTimes(1);
		expect(mocks.google.revokeAccess).not.toHaveBeenCalled();
	});

	it('offline local fallback: calls GoogleSignin.signOut', async () => {
		mocks.signOut.mockImplementation(async (opts?: unknown) =>
			isLocal(opts) ? { error: null } : { error: offline() },
		);
		expect(await account.signOut()).toEqual({ error: null });
		expect(mocks.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
		expect(mocks.google.signOut).toHaveBeenCalled();
	});

	it('skips the SDK call when there is no Google session on the device', async () => {
		mocks.google.hasPreviousSignIn.mockReturnValue(false);
		expect(await account.signOut()).toEqual({ error: null });
		expect(mocks.google.signOut).not.toHaveBeenCalled();
	});

	it('a rejecting Google SDK does not fail sign-out', async () => {
		mocks.google.signOut.mockRejectedValue(new Error('SIGN_IN_REQUIRED'));
		expect(await account.signOut()).toEqual({ error: null });
		expect(mocks.clearAll).toHaveBeenCalledTimes(1);
		expect(mocks.removeSession).not.toHaveBeenCalled();
	});

	it('a synchronously throwing Google SDK does not fail sign-out (online or offline)', async () => {
		mocks.google.hasPreviousSignIn.mockImplementation(() => {
			throw new Error('native module missing');
		});
		mocks.google.signOut.mockImplementation(() => {
			throw new Error('native module missing');
		});
		expect(await account.signOut()).toEqual({ error: null });
		mocks.signOut.mockImplementation(async (opts?: unknown) =>
			isLocal(opts) ? { error: null } : { error: offline() },
		);
		expect(await account.signOut()).toEqual({ error: null });
		expect(mocks.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
	});

	it('a hanging Google SDK does not block sign-out', async () => {
		vi.useFakeTimers();
		mocks.google.signOut.mockImplementation(never);
		const pending = account.signOut();
		await vi.advanceTimersByTimeAsync(10_000);
		await expect(pending).resolves.toEqual({ error: null });
		expect(mocks.signOut).toHaveBeenCalledTimes(1);
	});

	it('a Supabase failure is still reported when Google succeeds', async () => {
		mocks.signOut.mockResolvedValue({ error: offline() });
		mocks.removeSession.mockRejectedValue(new Error('storage unavailable'));
		const { error } = await account.signOut();
		expect(error?.message).toBe('storage unavailable');
	});
});

describe('account deletion revokes the Google grant', () => {
	it('deleteAccount calls GoogleSignin.revokeAccess', async () => {
		expect(await account.deleteAccount()).toEqual({ appleRevoked: false });
		expect(mocks.google.revokeAccess).toHaveBeenCalledTimes(1);
		expect(mocks.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
	});

	it('falls back to GoogleSignin.signOut when revokeAccess fails', async () => {
		mocks.google.revokeAccess.mockRejectedValue(new Error('network'));
		expect(await account.deleteAccount()).toEqual({ appleRevoked: false });
		expect(mocks.google.revokeAccess).toHaveBeenCalledTimes(1);
		expect(mocks.google.signOut).toHaveBeenCalled();
	});

	it('a throwing or hanging Google SDK does not fail the deletion', async () => {
		vi.useFakeTimers();
		mocks.google.revokeAccess.mockImplementation(never);
		mocks.google.signOut.mockImplementation(() => {
			throw new Error('boom');
		});
		const pending = account.deleteAccount();
		await vi.advanceTimersByTimeAsync(20_000);
		await expect(pending).resolves.toEqual({ appleRevoked: false });
		expect(mocks.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
	});

	it('does not revoke when the delete request fails', async () => {
		mocks.invoke.mockResolvedValue({ data: { ok: false, code: 'internal' }, error: null });
		await expect(account.deleteAccount()).rejects.toThrow();
		expect(mocks.google.revokeAccess).not.toHaveBeenCalled();
	});

	it('the lost-response sign-out (signOutAfterAccountDeletion) also revokes', async () => {
		const signOutAfterAccountDeletion = (
			account as unknown as { signOutAfterAccountDeletion?: () => Promise<void> }
		).signOutAfterAccountDeletion;
		expect(typeof signOutAfterAccountDeletion).toBe('function');
		await signOutAfterAccountDeletion?.();
		expect(mocks.google.revokeAccess).toHaveBeenCalledTimes(1);
		expect(mocks.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
	});
});

describe('Google sign-out wiring', () => {
	const read = (p: string) => {
		const file = resolve(__dirname, '..', p);
		return existsSync(file) ? readFileSync(file, 'utf8') : '';
	};
	const accountSrc = read('lib/account.ts');
	const profile = read('app/profile.tsx');
	const helper = read('lib/google-session.ts');

	it('the helper owns the SDK calls', () => {
		expect(helper).toMatch(/GoogleSignin\.signOut\(\s*\)/);
		expect(helper).toMatch(/GoogleSignin\.revokeAccess\(\s*\)/);
	});

	it('account.ts imports the helper and calls it on every sign-out path', () => {
		expect(accountSrc).toMatch(
			/import\s*\{[^}]*\bendGoogleSession\b[^}]*\}\s*from\s*'\.\/google-session'/,
		);
		// signOutLocally (offline fallback + deletion) and the online signOut branch.
		expect(accountSrc).toMatch(
			/export async function signOutLocally\(\)[^{]*\{[\s\S]*?await endGoogleSession\(\s*\)/,
		);
		expect(accountSrc).toMatch(
			/await shelfQueue\.clearAll\(\);\s*await endGoogleSession\(\s*\);\s*return \{ error: null \};/,
		);
		expect(accountSrc).toMatch(/await endGoogleSession\(\s*\{\s*revoke:\s*true\s*\}\s*\)/);
	});

	it('profile passes the revoking sign-out to the delete flow', () => {
		expect(profile).toMatch(/\bsignOutAfterAccountDeletion\b[^}]*\}\s*from\s*'@\/lib\/account'/);
		expect(profile).toMatch(/signOutLocally:\s*signOutAfterAccountDeletion\b/);
	});
});
