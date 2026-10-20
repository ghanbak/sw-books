/**
 * The Wookieepedia crawl taxonomy: the four novel categories we enumerate, the
 * canon/type each one derives (canon is most reliable at the category level —
 * see the plan's field-derivation rules), the categories we deliberately never
 * crawl, and the committed drift-guard count bands.
 *
 * `canon`/`type` come from *which* category a page sits in, so a silent taxonomy
 * change on Wookieepedia would otherwise yield a clean-but-wrong CSV. The bands
 * below are the tripwire: a crawl whose category count falls outside its band
 * fails loudly and never overwrites the discovery CSV.
 */

/** The three audience types, pinned to the `books.type` CHECK constraint. */
export type BookType = 'Adult Novel' | 'YA Novel' | 'Middle Grade Novel';

export type CategoryBucket = {
	/** Wookieepedia category title, without the `Category:` namespace prefix. */
	readonly category: string;
	/** Derived from the bucket — never from the page. */
	readonly canon: 'Canon' | 'Legends';
	/**
	 * Derived audience type for Canon buckets; `null` for Legends, which is
	 * resolved via Open Library / Google Books at promotion (the crawler never
	 * fabricates it).
	 */
	readonly type: BookType | null;
	/**
	 * Inclusive [min, max] member-count band. A live count outside this range
	 * trips the drift guard. Committed on 2026-10-20 against live counts of
	 * 50 / 18 / 31 / 84 with head/tail room for normal catalog growth.
	 */
	readonly band: readonly [number, number];
};

export const CATEGORY_BUCKETS: readonly CategoryBucket[] = [
	{ category: 'Canon adult novels', canon: 'Canon', type: 'Adult Novel', band: [40, 75] },
	{ category: 'Canon young-adult novels', canon: 'Canon', type: 'YA Novel', band: [10, 35] },
	{
		category: 'Canon middle-grade novels',
		canon: 'Canon',
		type: 'Middle Grade Novel',
		band: [20, 50],
	},
	{ category: 'Legends novels', canon: 'Legends', type: null, band: [65, 110] },
] as const;

/**
 * Categories we never enumerate. `Canon novels` is a container (its audience
 * subcats are the real buckets); the rest are non-novel or picture-book forms
 * excluded from scope. Kept as a committed guard: the crawler asserts no bucket
 * matches one of these, and they document what Phase 1 intentionally omits.
 */
export const EXCLUDED_CATEGORY_PATTERNS: readonly RegExp[] = [
	/^canon novels$/i, // container category — its audience subcats are the buckets
	/young-reader/i, // picture books
	/novellas?$/i, // novellas / eNovellas
	/enovellas?$/i,
	/graphic novels/i, // comics
	/novel series$/i, // container categories
] as const;

/** True when a category title is one we deliberately do not crawl. */
export function isExcludedCategory(title: string): boolean {
	const name = title.replace(/^category:/i, '').trim();
	return EXCLUDED_CATEGORY_PATTERNS.some((re) => re.test(name));
}

export type DriftResult = {
	readonly category: string;
	readonly count: number;
	readonly band: readonly [number, number];
	readonly ok: boolean;
};

/** Evaluate a per-category count against its committed band. */
export function checkDrift(bucket: CategoryBucket, count: number): DriftResult {
	const [min, max] = bucket.band;
	return { category: bucket.category, count, band: bucket.band, ok: count >= min && count <= max };
}
