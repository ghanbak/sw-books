/**
 * Profile "Delete account" flow, as pure orchestration over injected steps so it
 * unit-tests in the node vitest env (no React/native imports, like `lib/scan-mode.ts`).
 * The screen wires the real steps: an Alert for `confirm`, `lib/account.ts` for the rest.
 *
 * Order: confirm → (Apple users) fresh Apple authorization → delete. Cancelling either
 * prompt aborts without touching the account.
 *
 * The server deletes the user before the slow Apple revoke, so a request can fail on the
 * client (dropped connection, lost response) after the account is already gone. Any delete
 * failure therefore asks the auth server whether the user still exists; only a definitive
 * "gone" turns it into `deleted` (plus a local sign-out). An unanswered check keeps the error.
 */

export type DeleteAccountSteps = {
	/** Show the destructive confirmation; resolve `true` only on explicit "Delete". */
	confirm: () => Promise<boolean>;
	/** Whether the user signed in with Apple (needs a fresh code for token revocation). */
	isAppleUser: boolean;
	/** Show the Apple sheet; resolve the authorizationCode, or `undefined` if cancelled. */
	reauthenticateWithApple: () => Promise<string | undefined>;
	/** Called once the user has committed (both prompts passed), before the delete request. */
	onBusy?: () => void;
	deleteAccount: (opts?: { appleAuthorizationCode?: string }) => Promise<unknown>;
	/**
	 * After `deleteAccount` throws: resolve `true` only when the auth server definitively
	 * reports the user no longer exists. Network failures must resolve `false` (or throw).
	 */
	isAccountGone: () => Promise<boolean>;
	/** Clear the local session once the account is confirmed gone server-side. */
	signOutLocally: () => Promise<void>;
};

export type DeleteAccountOutcome =
	| { status: 'cancelled' }
	| { status: 'deleted' }
	| { status: 'failed'; message: string };

export const DELETE_ACCOUNT_FALLBACK_ERROR =
	'Your account could not be deleted. Check your connection and try again.';

export async function runDeleteAccountFlow(
	steps: DeleteAccountSteps,
): Promise<DeleteAccountOutcome> {
	try {
		if (!(await steps.confirm())) return { status: 'cancelled' };

		let appleAuthorizationCode: string | undefined;
		if (steps.isAppleUser) {
			appleAuthorizationCode = await steps.reauthenticateWithApple();
			if (!appleAuthorizationCode) return { status: 'cancelled' };
		}

		steps.onBusy?.();
		try {
			await steps.deleteAccount(appleAuthorizationCode ? { appleAuthorizationCode } : undefined);
		} catch (err) {
			if (!(await steps.isAccountGone().catch(() => false))) throw err;
			await steps.signOutLocally().catch(() => {});
		}
		return { status: 'deleted' };
	} catch (err) {
		return { status: 'failed', message: errorMessage(err) };
	}
}

function errorMessage(err: unknown): string {
	if (err instanceof Error && err.message.trim()) return err.message;
	return DELETE_ACCOUNT_FALLBACK_ERROR;
}
