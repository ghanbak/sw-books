import type { ShelfWriteFailure } from '@/lib/shelf';

/**
 * User-facing copy for failed Supabase reads and writes (#393). Screens never show a
 * supabase-js `error.message`: offline it reads "TypeError: Network request failed", and
 * a server rejection names tables and policies. Callers log the raw text with
 * `console.warn` and show these strings instead.
 */

export const CONNECTIVITY_ERROR_COPY = 'Check your connection and try again.';
export const GENERIC_ERROR_COPY = 'Something went wrong. Try again in a moment.';

/** Body for a failed Add to library (shelf scan and barcode). */
export const ADD_FAILED_COPY = "Couldn't save — check your connection and try again.";

/** Copy for a `classifyShelfWriteError` result. */
export function errorCopy(failure: ShelfWriteFailure): string {
	return failure === 'connectivity' ? CONNECTIVITY_ERROR_COPY : GENERIC_ERROR_COPY;
}

/** Alert body for a failed `addOwned`. `not_signed_in` carries app-authored copy. */
export function addFailureCopy(error: { code: string; message: string }): string {
	return error.code === 'not_signed_in' ? error.message : ADD_FAILED_COPY;
}
