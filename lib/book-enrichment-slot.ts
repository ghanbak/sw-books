import type { BookEnrichmentStatus } from '@/lib/hooks';

export type EnrichmentSlot<E> =
	| { kind: 'content'; enrichment: E }
	| { kind: 'error' }
	| { kind: 'none' };

/**
 * What the book detail screen shows where the Wookieepedia cards go. Enrichment on hand
 * (fresh or cached) always renders, even if a refetch failed; a failed fetch with nothing
 * to show gets the inline error + Retry; loading and "no enrichment row" show nothing.
 */
export function enrichmentSlot<E>(
	status: BookEnrichmentStatus,
	enrichment: E | null,
): EnrichmentSlot<E> {
	if (enrichment) return { kind: 'content', enrichment };
	if (status === 'error') return { kind: 'error' };
	return { kind: 'none' };
}
