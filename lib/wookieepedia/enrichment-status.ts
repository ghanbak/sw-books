/**
 * Enrichment status vocabulary. Dependency-free so client components can import
 * it; the derivation lives in ./enrichment-states (server/sync side).
 */

export const ENRICHMENT_STATUSES = ['enriched', 'pinned', 'flagged', 'no_page'] as const;
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

export const ENRICHMENT_STATUS_LABELS: Record<EnrichmentStatus, string> = {
	enriched: 'Enriched',
	pinned: 'Pinned',
	flagged: 'Flagged',
	no_page: 'No page',
};
