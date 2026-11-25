import { errorCopy } from '@/lib/error-copy';
import { classifyShelfWriteError } from '@/lib/shelf';

/**
 * User-facing copy for failed sign-in and sign-out (#398). Like `lib/error-copy`, alerts
 * never show a supabase-js / GoTrue `error.message`: offline it reads "Network request
 * failed", and server errors can name internals. The raw text goes to `console.warn`.
 */

export const INVALID_CREDENTIALS_COPY = "Those sign-in details didn't match. Try again.";

type ErrorShape = { code?: string | null; message?: string | null; status?: number };

function shape(error: unknown): ErrorShape {
	if (typeof error === 'object' && error !== null) return error as ErrorShape;
	return { message: typeof error === 'string' ? error : null };
}

/**
 * Copy for a thrown sign-in error or a returned sign-out error. auth-js reports an
 * unreachable server as `AuthRetryableFetchError` with status 0 or 502/503/504; a bare
 * `TypeError('Network request failed')` has no status and is matched by its message.
 */
export function authErrorCopy(error: unknown): string {
	const e = shape(error);
	if (e.code === 'invalid_credentials') return INVALID_CREDENTIALS_COPY;
	const status = typeof e.status === 'number' ? e.status : undefined;
	return errorCopy(classifyShelfWriteError({ code: e.code, message: e.message }, status));
}

/** Logs the raw error text and returns the copy to show. `action` names the flow. */
export function reportAuthError(action: string, error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	console.warn(`[auth] ${action} failed:`, raw);
	return authErrorCopy(error);
}
