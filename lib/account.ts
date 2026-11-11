import type { User } from '@supabase/supabase-js';
import { FunctionsHttpError, isAuthApiError } from '@supabase/supabase-js';

import {
	DELETE_ACCOUNT_ERROR_MESSAGES,
	type DeleteAccountResponse,
	deleteAccountErrorMessage,
	findAppleSubject,
	isAppleUser as hasAppleIdentity,
} from '../supabase/functions/_shared/account-deletion';
import { requestAppleCredential } from './auth';
import { shelfQueue } from './shelf-queue';
import { supabase } from './supabase';

export { DELETE_ACCOUNT_ERROR_MESSAGES };

// Access token of the latest delete attempt, kept in memory so `isAccountGone` can still ask
// the auth server after a failed refresh has already cleared the stored session.
let deletionAccessToken: string | undefined;

/** Whether the account signed in with Apple (deletion then needs a fresh Apple code). */
export function isAppleUser(user: User | null | undefined): boolean {
	return hasAppleIdentity(user);
}

/**
 * Show the Apple sheet to get a fresh, single-use `authorizationCode` (valid 5 minutes)
 * that the `delete-account` function exchanges and revokes (Apple TN3194).
 * Resolves `undefined` when the user cancels; throws on any other failure.
 */
export async function reauthenticateWithAppleForDeletion(): Promise<string | undefined> {
	let credential: Awaited<ReturnType<typeof requestAppleCredential>>['credential'];
	try {
		({ credential } = await requestAppleCredential());
	} catch (err) {
		if ((err as { code?: unknown } | null)?.code === 'ERR_REQUEST_CANCELED') return undefined;
		throw new Error('Sign in with Apple failed. Try again.');
	}

	const {
		data: { session },
	} = await supabase.auth.getSession();
	const expected = findAppleSubject(session?.user);
	if (expected && credential.user !== expected) {
		throw new Error('Use the Apple ID you signed in with to delete this account.');
	}
	return credential.authorizationCode ?? undefined;
}

/**
 * Permanently delete the signed-in account (shelves cascade). For Apple users pass the
 * code from `reauthenticateWithAppleForDeletion` so Apple's token is revoked too.
 * Throws an Error with a user-safe message; signs out locally on success.
 */
export async function deleteAccount(opts?: {
	appleAuthorizationCode?: string;
}): Promise<{ appleRevoked: boolean }> {
	// The function only accepts an access token minted in the last 10 minutes; refreshing
	// proves we hold the refresh token, not just a (possibly leaked) access token.
	const {
		data: { session },
	} = await supabase.auth.getSession();
	deletionAccessToken = session?.access_token;
	const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
	if (refreshError) throw new Error(DELETE_ACCOUNT_ERROR_MESSAGES.unauthorized);
	deletionAccessToken = refreshed.session?.access_token ?? deletionAccessToken;

	const body = opts?.appleAuthorizationCode
		? { appleAuthorizationCode: opts.appleAuthorizationCode }
		: {};
	const { data, error } = await supabase.functions.invoke<DeleteAccountResponse>('delete-account', {
		method: 'POST',
		body,
	});

	if (error) {
		let payload: unknown;
		if (error instanceof FunctionsHttpError) {
			payload = await (error.context as Response)
				.clone()
				.json()
				.catch(() => undefined);
		}
		throw new Error(deleteAccountErrorMessage(payload));
	}
	if (!data?.ok) throw new Error(deleteAccountErrorMessage(data));

	await signOutLocally().catch(() => {});
	return { appleRevoked: data.appleRevoked };
}

/**
 * After a failed `deleteAccount`: whether the auth server definitively reports the user gone
 * (the delete landed but its response was lost). The auth server answers `user_not_found`
 * when the JWT's subject no longer exists; network errors, expired tokens and missing
 * sessions are not proof of deletion and resolve `false`.
 */
export async function isAccountGone(): Promise<boolean> {
	if (!deletionAccessToken) return false;
	const { error } = await supabase.auth.getUser(deletionAccessToken);
	return isAuthApiError(error) && error.code === 'user_not_found';
}

/**
 * Deliberate sign-out. Revokes the session globally (default scope) when online; on any
 * error, returned or thrown (e.g. `AuthRetryableFetchError` offline), falls back to
 * `signOutLocally`. Returns an error only when that local clear also fails.
 */
export async function signOut(): Promise<{ error: Error | null }> {
	try {
		const { error } = await supabase.auth.signOut();
		if (!error) {
			await shelfQueue.clearAll();
			return { error: null };
		}
	} catch {
		// Fall through to the local clear.
	}
	try {
		await signOutLocally();
		return { error: null };
	} catch (err) {
		return { error: err instanceof Error ? err : new Error('Sign-out failed. Try again.') };
	}
}

type SessionRemover = { _removeSession?: () => Promise<void> };

/**
 * Clear the local session only (the user's server session is gone, or the server is
 * unreachable). Throws when the stored session could not be cleared.
 */
export async function signOutLocally(): Promise<void> {
	deletionAccessToken = undefined;
	// First: signOut can return early without clearing anything if the session read fails.
	await shelfQueue.clearAll();
	const { error } = await supabase.auth.signOut({ scope: 'local' });
	if (!error) return;
	// auth-js (2.103) still POSTs /logout for scope 'local' and returns a network error
	// before removing the stored session. Its private `_removeSession` clears storage and
	// emits SIGNED_OUT with no network call; re-check it on every auth-js upgrade.
	const auth = supabase.auth as unknown as SessionRemover;
	if (typeof auth._removeSession !== 'function') throw error;
	await auth._removeSession.call(supabase.auth);
}
