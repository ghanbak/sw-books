/**
 * Slug generation for new catalog books.
 *
 * Produces a clean, predictable kebab-case slug from a title. The existing 185
 * slugs carry some editorial judgement (series prefixes hand-dropped, a few
 * leading "The"s removed), so this is a sensible *default* the operator can edit
 * at create time — not an attempt to reproduce every hand-curated slug. After
 * create the slug is immutable.
 *
 * Rules (matched against the existing catalog):
 *  - strip diacritics ("Cafe" with an accent -> cafe)
 *  - drop apostrophes entirely ("Queen's" -> queens, "Empire's" -> empires)
 *  - "&" -> "and" ("Master & Apprentice" -> master-and-apprentice)
 *  - any other non-alphanumeric run -> a single "-"; trim/collapse dashes
 */
export function slugify(title: string): string {
	return title
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '') // strip combining diacritical marks
		.replace(/['‘’ʼ]/g, '') // straight + curly apostrophes -> removed
		.replace(/&/g, ' and ')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Return `base` if free, else the first `base-2`, `base-3`, … not in `taken`.
 * `taken` is the set of existing slugs (CSV ∪ DB).
 */
export function ensureUniqueSlug(base: string, taken: Iterable<string>): string {
	const set = taken instanceof Set ? taken : new Set(taken);
	if (!set.has(base)) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base}-${n}`;
		if (!set.has(candidate)) return candidate;
	}
}
