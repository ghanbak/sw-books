import type { User } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';

import {
	DELETE_ACCOUNT_ERROR_MESSAGES,
	type DeleteAccountResponse,
	deleteAccountErrorMessage,
	findAppleSubject,
	isAppleUser as hasAppleIdentity,
} from '../supabase/functions/_shared/account-deletion';
import { requestAppleCredential } from './auth';
import { supabase } from './supabase';

export { DELETE_ACCOUNT_ERROR_MESSAGES };

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
	const { error: refreshError } = await supabase.auth.refreshSession();
	if (refreshError) throw new Error(DELETE_ACCOUNT_ERROR_MESSAGES.unauthorized);

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

	// The user and its refresh tokens are gone server-side; clear the local session only.
	await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
	return { appleRevoked: data.appleRevoked };
}
