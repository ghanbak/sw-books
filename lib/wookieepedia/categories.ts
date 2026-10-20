/**
 * The Wookieepedia crawl taxonomy: the four top-level novel categories we
 * enumerate, the canon/type each one derives (canon is most reliable at the
 * category level — see the plan's field-derivation rules), the categories we
 * deliberately never crawl, and the committed drift-guard count bands.
 *
 * `canon`/`type` come from *which* bucket a page sits in, so a silent taxonomy
 * change on Wookieepedia would otherwise yield a clean-but-wrong CSV. The bands
 * below are the tripwire: a crawl whose bucket count falls outside its band
 * fails loudly and never overwrites the discovery CSV.
 *
 * Sub-category recursion (added 2026-10-20): each bucket also enumerates the
 * page members of its DIRECT sub-categories, one level deep, unioned and
 * de-duped on `pageid`. This is required because many novels live only in
 * series sub-categories, never in the flat parent:
 *   - Legends series subcats (X-Wing, The New Jedi Order, Legacy of the Force,
 *     Fate of the Jedi, Coruscant Nights, Old Republic, Clone Wars, …) hold
 *     novels absent from the flat `Legends novels` listing.
 *   - Canon High Republic novels live in `Star Wars: The High Republic
 *     {adult,young-adult,junior} novels`, which are SUB-categories of the three
 *     Canon tier buckets — so recursion reaches them AND the tier (type) is
 *     inherited transitively from the parent bucket (THR-adult ⊂ Canon adult).
 *
 * Type-derivation rule under recursion: a sub-category member inherits its
 * PARENT bucket's `canon` + `type`, because the subcat is a subcategory of that
 * tier (membership is transitive — a THR-adult book IS a Canon-adult book). We
 * only recurse from tier-bearing buckets, so every discovered Canon book has a
 * derivable tier. If a future source reaches a Canon book ONLY via a category
 * that does NOT encode a tier (e.g. a cross-cutting High-Republic container that
 * is not under adult/YA/MG), leave `type` unset rather than guessing — do not
 * add such a category as a recursing bucket.
 *
 * Excluded sub-categories are skipped during recursion (see
 * `EXCLUDED_CATEGORY_PATTERNS`), and the `{{Book}}` infobox filter in the crawler
 * is the final safety net: container/boxed-set/inter/dramatis-personae pages that
 * slip through a kept subcat have no `{{Book}}` template and are dropped.
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
	 * Recurse one level into this bucket's direct sub-categories, unioning their
	 * page members (de-duped on `pageid`) with the bucket's own flat members.
	 * Excluded subcats are skipped. Members gained this way inherit the bucket's
	 * `canon` + `type`.
	 */
	readonly recurseSubcats: boolean;
	/**
	 * Inclusive [min, max] band for the bucket's FULL enumerated count (flat
	 * members ∪ one-level kept-subcat members, de-duped on `pageid`, before the
	 * `{{Book}}` infobox filter). A live count outside this range trips the drift
	 * guard. Committed on 2026-10-20 against live union counts of
	 * 58 / 26 / 46 / 162 with head/tail room for normal catalog + series growth.
	 */
	readonly band: readonly [number, number];
};

export const CATEGORY_BUCKETS: readonly CategoryBucket[] = [
	{
		category: 'Canon adult novels',
		canon: 'Canon',
		type: 'Adult Novel',
		recurseSubcats: true,
		band: [45, 85],
	},
	{
		category: 'Canon young-adult novels',
		canon: 'Canon',
		type: 'YA Novel',
		recurseSubcats: true,
		band: [18, 45],
	},
	{
		category: 'Canon middle-grade novels',
		canon: 'Canon',
		type: 'Middle Grade Novel',
		recurseSubcats: true,
		band: [34, 70],
	},
	{
		category: 'Legends novels',
		canon: 'Legends',
		type: null,
		recurseSubcats: true,
		band: [135, 200],
	},
] as const;

/**
 * Categories we never enumerate — applied in two places: the crawler asserts no
 * top-level bucket matches one of these, AND recursion skips any direct
 * sub-category whose title matches (so kept subcats stay novels-only).
 * `Canon novels` is a container (its audience subcats are the real buckets); the
 * rest are non-novel or picture-book forms excluded from scope. They document
 * what Phase 1 intentionally omits.
 */
export const EXCLUDED_CATEGORY_PATTERNS: readonly RegExp[] = [
	/^canon novels$/i, // container category — its audience subcats are the buckets
	/young-reader/i, // picture books (e.g. "Legends young-reader novels")
	/novellas?$/i, // novellas / eNovellas
	/enovellas?$/i,
	/graphic novels/i, // comics
	/novel series$/i, // container categories (e.g. "Legends novel series")
	/audiobooks?$/i, // audio editions (e.g. "The Essential Legends Collection audiobooks")
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
