/**
 * Result selection for a barcode ISBN lookup. postgrest-js does not throw on fetch or
 * server failures — it resolves `{ data: null, error }` — so `error` must be checked
 * before the empty-result branch, or a network failure reads as "Not in the Archive".
 * Type-only import keeps this testable in the node vitest env.
 */
import type { Book } from '@/lib/hooks';

export type BarcodeLookupResult =
	| { type: 'found'; book: Book }
	| { type: 'not_found'; isbn: string }
	| { type: 'error' };

export function selectBarcodeLookupResult(
	isbn: string,
	response: { data: Book[] | null; error: unknown },
): BarcodeLookupResult {
	if (response.error) return { type: 'error' };
	const book = response.data?.[0];
	return book ? { type: 'found', book } : { type: 'not_found', isbn };
}
