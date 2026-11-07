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
});
