/**
 * Amazon affiliate URL helpers. Pure functions, no React, no I/O.
 *
 * v1 strategy: single ISBN search with the Books category filter.
 * Amazon's results page surfaces all available variants (paperback,
 * hardcover, eBook, audiobook) on the same page — verified empirically
 * May 2026. The user's region also auto-filters via Amazon's geo logic.
 *
 * Reference: docs/plans/2026-05-04-feat-amazon-affiliate-buy-buttons-plan.md
 */

const AMAZON_AFFILIATE_TAG = 'ghanbak-20';
const AMAZON_BASE = 'https://www.amazon.com';

/**
 * Builds an affiliate-tagged Amazon search URL for a single ISBN.
 * Filters to the Books category (i=stripbooks). Returns null if the
 * ISBN is missing or fails the length check (10 or 13 digits after
 * stripping hyphens/whitespace).
 */
export function buildAmazonSearchUrl(isbn: string | null | undefined): string | null {
	if (!isbn) return null;
	const cleaned = isbn.replace(/[-\s]/g, '');
	if (cleaned.length !== 10 && cleaned.length !== 13) return null;

	const params = new URLSearchParams({
		k: cleaned,
		i: 'stripbooks',
		tag: AMAZON_AFFILIATE_TAG,
	});
	return `${AMAZON_BASE}/s?${params.toString()}`;
}
