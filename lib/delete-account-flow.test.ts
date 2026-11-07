import { describe, expect, it, vi } from 'vitest';

import {
	DELETE_ACCOUNT_FALLBACK_ERROR,
	type DeleteAccountSteps,
	runDeleteAccountFlow,
} from './delete-account-flow';

function steps(overrides: Partial<DeleteAccountSteps> = {}) {
	return {
		confirm: vi.fn(async () => true),
		isAppleUser: false,
		reauthenticateWithApple: vi.fn(async (): Promise<string | undefined> => 'apple-code'),
		onBusy: vi.fn(),
		deleteAccount: vi.fn(async () => ({ appleRevoked: false })),
		isAccountGone: vi.fn(async () => false),
		signOutLocally: vi.fn(async () => {}),
		...overrides,
	};
}

describe('runDeleteAccountFlow', () => {
	it('cancels without deleting when the confirmation is dismissed', async () => {
		const s = steps({ confirm: vi.fn(async () => false) });
		expect(await runDeleteAccountFlow(s)).toEqual({ status: 'cancelled' });
		expect(s.reauthenticateWithApple).not.toHaveBeenCalled();
		expect(s.onBusy).not.toHaveBeenCalled();
		expect(s.deleteAccount).not.toHaveBeenCalled();
	});

	it('deletes non-Apple users without the Apple sheet', async () => {
		const s = steps();
		expect(await runDeleteAccountFlow(s)).toEqual({ status: 'deleted' });
		expect(s.reauthenticateWithApple).not.toHaveBeenCalled();
		expect(s.deleteAccount).toHaveBeenCalledWith(undefined);
	});

	it('passes a fresh Apple authorization code for Apple users', async () => {
		const s = steps({ isAppleUser: true });
		expect(await runDeleteAccountFlow(s)).toEqual({ status: 'deleted' });
		expect(s.deleteAccount).toHaveBeenCalledWith({ appleAuthorizationCode: 'apple-code' });
	});

	it('aborts when the Apple sheet is cancelled', async () => {
		const s = steps({ isAppleUser: true, reauthenticateWithApple: vi.fn(async () => undefined) });
		expect(await runDeleteAccountFlow(s)).toEqual({ status: 'cancelled' });
		expect(s.onBusy).not.toHaveBeenCalled();
		expect(s.deleteAccount).not.toHaveBeenCalled();
	});

	it('marks busy only after both prompts pass, before the request', async () => {
		const order: string[] = [];
		const s = steps({
			isAppleUser: true,
			reauthenticateWithApple: vi.fn(async () => {
				order.push('apple');
				return 'code';
			}),
			onBusy: vi.fn(() => order.push('busy')),
			deleteAccount: vi.fn(async () => {
				order.push('delete');
			}),
		});
		await runDeleteAccountFlow(s);
		expect(order).toEqual(['apple', 'busy', 'delete']);
	});

	it('surfaces the thrown error message', async () => {
		const s = steps({
			deleteAccount: vi.fn(async () => {
				throw new Error('Too many attempts. Try again later.');
			}),
		});
		expect(await runDeleteAccountFlow(s)).toEqual({
			status: 'failed',
			message: 'Too many attempts. Try again later.',
		});
	});

	it('falls back to a generic message for non-Error or empty throws', async () => {
		const s = steps({
			deleteAccount: vi.fn(async () => {
				throw 'boom';
			}),
		});
		expect(await runDeleteAccountFlow(s)).toEqual({
			status: 'failed',
			message: DELETE_ACCOUNT_FALLBACK_ERROR,
		});
		const empty = steps({
			isAppleUser: true,
			reauthenticateWithApple: vi.fn(async () => {
				throw new Error('  ');
			}),
		});
		expect(await runDeleteAccountFlow(empty)).toEqual({
			status: 'failed',
			message: DELETE_ACCOUNT_FALLBACK_ERROR,
		});
		expect(empty.deleteAccount).not.toHaveBeenCalled();
	});

	describe('when the delete request fails after the server already deleted the user', () => {
		const lostResponse = () =>
			vi.fn(async () => {
				throw new Error('Your account could not be deleted. Check your connection and try again.');
			});

		it('reports deleted and signs out locally when the server says the user is gone', async () => {
			const s = steps({
				isAppleUser: true,
				deleteAccount: lostResponse(),
				isAccountGone: vi.fn(async () => true),
			});
			expect(await runDeleteAccountFlow(s)).toEqual({ status: 'deleted' });
			expect(s.isAccountGone).toHaveBeenCalledTimes(1);
			expect(s.signOutLocally).toHaveBeenCalledTimes(1);
		});

		it('still reports deleted if the local sign-out fails', async () => {
			const s = steps({
				deleteAccount: lostResponse(),
				isAccountGone: vi.fn(async () => true),
				signOutLocally: vi.fn(async () => {
					throw new Error('storage');
				}),
			});
			expect(await runDeleteAccountFlow(s)).toEqual({ status: 'deleted' });
		});

		it('keeps the error when the user still exists', async () => {
			const s = steps({ deleteAccount: lostResponse(), isAccountGone: vi.fn(async () => false) });
			expect(await runDeleteAccountFlow(s)).toEqual({
				status: 'failed',
				message: 'Your account could not be deleted. Check your connection and try again.',
			});
			expect(s.signOutLocally).not.toHaveBeenCalled();
		});

		it('keeps the error when the existence check itself fails (still offline)', async () => {
			const s = steps({
				deleteAccount: vi.fn(async () => {
					throw new Error('Your session has expired. Sign in again, then delete your account.');
				}),
				isAccountGone: vi.fn(async () => {
					throw new TypeError('Network request failed');
				}),
			});
			expect(await runDeleteAccountFlow(s)).toEqual({
				status: 'failed',
				message: 'Your session has expired. Sign in again, then delete your account.',
			});
			expect(s.signOutLocally).not.toHaveBeenCalled();
		});

		it('does not check when the request succeeds or a prompt fails', async () => {
			const ok = steps();
			await runDeleteAccountFlow(ok);
			expect(ok.isAccountGone).not.toHaveBeenCalled();
			const apple = steps({
				isAppleUser: true,
				reauthenticateWithApple: vi.fn(async () => {
					throw new Error('Sign in with Apple failed. Try again.');
				}),
				isAccountGone: vi.fn(async () => true),
			});
			expect(await runDeleteAccountFlow(apple)).toEqual({
				status: 'failed',
				message: 'Sign in with Apple failed. Try again.',
			});
			expect(apple.isAccountGone).not.toHaveBeenCalled();
		});
	});
});
