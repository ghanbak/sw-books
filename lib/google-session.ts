import { GoogleSignin } from '@react-native-google-signin/google-signin';

/** Upper bound per SDK call, so a stuck native call can't hold up sign-out or deletion. */
export const GOOGLE_SESSION_TIMEOUT_MS = 3000;

/**
 * End the native Google session so the next "Continue with Google" shows the account
 * chooser instead of reusing the cached account. `revoke` (account deletion) also removes
 * the app's Google grant, falling back to a plain sign-out. Best-effort: never throws and
 * resolves within ~2 × `GOOGLE_SESSION_TIMEOUT_MS`. No-op when the device has no Google
 * session (Apple and email users).
 */
export async function endGoogleSession(opts?: { revoke?: boolean }): Promise<void> {
	try {
		if (!GoogleSignin.hasPreviousSignIn()) return;
	} catch {
		// Unknown state: try anyway.
	}
	if (opts?.revoke && (await settle(() => GoogleSignin.revokeAccess()))) return;
	await settle(() => GoogleSignin.signOut());
}

/** Resolves `true` when `call` succeeds in time; `false` on throw, rejection or timeout. */
async function settle(call: () => Promise<unknown>): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			call().then(() => true),
			new Promise<boolean>((resolve) => {
				timer = setTimeout(() => resolve(false), GOOGLE_SESSION_TIMEOUT_MS);
			}),
		]);
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}
