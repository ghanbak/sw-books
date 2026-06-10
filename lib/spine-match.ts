import type { Book } from '@/lib/hooks';

/**
 * Spine matcher — resolves noisy OCR text from bookshelf spines to the in-memory
 * catalog. Pure logic, no native deps, Hermes-safe; the camera/OCR layer feeds it
 * `OcrFragment[]` and it returns ranked, confidence-bucketed catalog matches.
 *
 * v1 scoring: IDF-weighted token coverage + a title-coverage floor + an
 * evidence-quality gate + score/margin confidence buckets, where margin counts only
 * superset-evidence competitors. Calibrated in Phase 4.5 against real labeled shelf
 * photos (28 catalog books + heavy off-catalog noise); all tunable values live in
 * `MATCH_CONSTANTS`. Remaining known failure mode: non-book media physically labeled
 * with a catalog title (e.g. a film's DVD spine) is genuine text evidence and can
 * surface its novelization — the review queue is the designed escape for that.
 */

/** One unit of recognized text (a line/block from OCR). The matcher only needs `text`. */
export type OcrFragment = { text: string };

export type Bucket = 'high' | 'low';

export type Candidate = { book: Book; score: number };

export type SpineMatch = {
	/** Representative catalog row for the matched work (editions collapsed). */
	book: Book;
	/** Final score, 0..1. */
	score: number;
	/**
	 * Gap to the best superset-evidence competitor — a candidate that explains ALL of
	 * this work's observed title evidence (and possibly more). Equals `score` when no
	 * such competitor exists; 0 for an exact evidence-and-score tie. Never negative
	 * (a strictly better competitor drops this match instead).
	 */
	margin: number;
	/** `high` → pre-selected; `low` → "double-check these". Rejects are not returned. */
	bucket: Bucket;
	/** Distinct fragments that corroborated this work's title (cross-photo). */
	supports: number;
	/** Other plausible works for the same spine, ranked — powers the swap UI. */
	alternates: Candidate[];
};

export type CatalogIndex = {
	works: WorkEntry[];
	size: number;
};

export type MatchConstants = {
	readonly MIN_TITLE_TOKEN_COVERAGE: number;
	readonly MAX_TITLE_TOKEN_DF: number;
	readonly HIGH_SCORE: number;
	readonly HIGH_MARGIN: number;
	readonly LOW_SCORE: number;
	readonly SUPPORT_BOOST: number;
	readonly SUPPORT_CAP: number;
	readonly MAX_ALTERNATES: number;
};

/**
 * Calibrated 2026-06-10 (Phase 4.5) on 3 labeled shelf photos: 28 expected catalog
 * books, ~12 on-shelf off-catalog books, DVDs, and two full non–Star Wars shelves as
 * noise. Result at these values: high-bucket recall 1.00 with the only high FPs
 * caused by a DVD spine bearing a catalog title verbatim. Desktop OCR (Apple Vision)
 * proxied ML Kit — revalidate on device (see plan). Sweep harness: `.calibration/`
 * (local-only, gitignored — contains personal shelf photos).
 */
export const MATCH_CONSTANTS = {
	/** Min distinct title tokens a match must cover (count-based, not IDF-mass). */
	MIN_TITLE_TOKEN_COVERAGE: 2,
	/**
	 * A title token is "distinctive" when it appears in at most this many works.
	 * Multi-token titles whose evidence is never paired in one fragment must rest on
	 * ≥2 distinctive tokens — blocks matches assembled from common tokens ('wing',
	 * 'jedi', 'solo') scattered across different spines.
	 */
	MAX_TITLE_TOKEN_DF: 5,
	/** A match is auto-selected only at/above this score AND margin. */
	HIGH_SCORE: 0.6,
	HIGH_MARGIN: 0.12,
	/** At/above this score (but not "high") → "double-check these". */
	LOW_SCORE: 0.4,
	/** Per extra corroborating fragment, capped. */
	SUPPORT_BOOST: 0.03,
	SUPPORT_CAP: 2,
	/** Cap on ranked alternates returned for the swap UI. */
	MAX_ALTERNATES: 5,
} as const satisfies MatchConstants;

const STOPWORDS = new Set(['the', 'of', 'a', 'an', 'and', 'to', 'in', 'on', 'for', 'by']);

/** Format preference when collapsing editions, best first; unknown formats rank last. */
const FORMAT_PRIORITY = ['hardcover', 'paperback', 'ebook', 'audiobook'];

type WorkEntry = {
	book: Book;
	/** All searchable tokens (title + author + series) → idf weight. */
	tokens: Map<string, number>;
	/** Title tokens only — used for the coverage floor and competitor detection. */
	titleTokens: Set<string>;
	/** Document frequency per title token — powers the distinctive-evidence gate. */
	titleDf: Map<string, number>;
	/** Sum of idf over `tokens` (the coverage denominator). */
	totalIdf: number;
};

/**
 * Normalizes text into match tokens: NFKD diacritic-strip, lowercase, split on any
 * non-alphanumeric, drop stopwords and 1-char tokens. Applied identically to catalog
 * and OCR text. (`\p{Diacritic}` + `normalize` are supported by Hermes on RN 0.81.)
 */
export function normalizeTokens(text: string): string[] {
	const folded = text
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '') // strip diacritics (NFKD splits them into combining marks)
		.toLowerCase();
	const out: string[] = [];
	for (const raw of folded.split(/[^a-z0-9]+/)) {
		if (raw.length < 2) continue;
		if (STOPWORDS.has(raw)) continue;
		out.push(raw);
	}
	return out;
}

/**
 * Key that collapses editions of one work. Authorless books never collapse (each keys on
 * its own id) so two distinct authorless same-title works are not wrongly merged.
 */
function editionKey(book: Book): string {
	const author = book.author?.[0] ? normalizeTokens(book.author[0]).join(' ') : '';
	if (!author) return `__noauthor__:${book.id}`;
	const title = normalizeTokens(book.title).join(' ');
	return `${title}|${author}`;
}

function formatRank(book: Book): number {
	const formats = (book.format ?? []).map((f) => f.toLowerCase());
	for (let i = 0; i < FORMAT_PRIORITY.length; i++) {
		if (formats.includes(FORMAT_PRIORITY[i])) return i;
	}
	return FORMAT_PRIORITY.length;
}

/** Picks the representative row for a work: primary_isbn → format priority → timeline_order. */
function preferredEdition(a: Book, b: Book): Book {
	const aIsbn = a.primary_isbn ? 0 : 1;
	const bIsbn = b.primary_isbn ? 0 : 1;
	if (aIsbn !== bIsbn) return aIsbn < bIsbn ? a : b;

	const aFmt = formatRank(a);
	const bFmt = formatRank(b);
	if (aFmt !== bFmt) return aFmt < bFmt ? a : b;

	const aTl = a.timeline_order ?? Number.POSITIVE_INFINITY;
	const bTl = b.timeline_order ?? Number.POSITIVE_INFINITY;
	if (aTl !== bTl) return aTl < bTl ? a : b;
	return a;
}

/**
 * Buckets a candidate by its score and margin to the best competing interpretation.
 * Returns `null` for a reject (not surfaced). Exported for direct boundary testing.
 */
export function classifyConfidence(
	score: number,
	margin: number,
	constants: MatchConstants = MATCH_CONSTANTS,
): Bucket | null {
	const { HIGH_SCORE, HIGH_MARGIN, LOW_SCORE } = constants;
	if (score >= HIGH_SCORE && margin >= HIGH_MARGIN) return 'high';
	// A strong score with a thin margin (an ambiguous near-tie) drops to double-check
	// rather than auto-adding.
	if (score >= LOW_SCORE) return 'low';
	return null;
}

/**
 * Builds the catalog index once (collapsing editions to one work each) so `matchFragments`
 * can score against it with no per-call allocation of the token vectors.
 */
export function buildCatalogIndex(books: Book[]): CatalogIndex {
	// 1. Collapse editions → one representative book per work.
	const groups = new Map<string, Book>();
	for (const book of books) {
		const key = editionKey(book);
		const existing = groups.get(key);
		groups.set(key, existing ? preferredEdition(existing, book) : book);
	}
	const reps = [...groups.values()];
	const n = reps.length;

	// 2. Document frequency over the representative set.
	const df = new Map<string, number>();
	const collected = reps.map((book) => {
		const titleTokens = new Set(normalizeTokens(book.title));
		const allTokens = new Set<string>(titleTokens);
		for (const author of book.author ?? []) {
			for (const t of normalizeTokens(author)) allTokens.add(t);
		}
		if (book.series_name) {
			for (const t of normalizeTokens(book.series_name)) allTokens.add(t);
		}
		for (const t of allTokens) df.set(t, (df.get(t) ?? 0) + 1);
		return { book, titleTokens, allTokens };
	});

	// 3. Smoothed idf (`ln((1+N)/(1+df)) + 1`) and the per-work weighted token map + total
	//    mass. The +1 smoothing keeps every weight ≥1 (never zero/negative), so coverage
	//    scoring is well-behaved even on tiny catalogs; ubiquitous franchise words still get
	//    the floor weight while distinctive tokens dominate.
	const idf = (t: string) => Math.log((1 + n) / (1 + (df.get(t) ?? 0))) + 1;
	const works: WorkEntry[] = collected.map(({ book, titleTokens, allTokens }) => {
		const tokens = new Map<string, number>();
		let totalIdf = 0;
		for (const t of allTokens) {
			const w = idf(t);
			tokens.set(t, w);
			totalIdf += w;
		}
		const titleDf = new Map<string, number>();
		for (const t of titleTokens) titleDf.set(t, df.get(t) ?? 0);
		return { book, tokens, titleTokens, titleDf, totalIdf };
	});

	return { works, size: n };
}

type Scored = {
	entry: WorkEntry;
	score: number;
	supports: number;
	/** Title tokens of this work actually present in the bag (its observed evidence). */
	observed: Set<string>;
};

/**
 * Matches a session's OCR fragments (all photos pooled) against the catalog index.
 * Returns ranked, confidence-bucketed matches, deduped by work, with swap alternates.
 * `constants` is overridable for the Phase 4.5 calibration harness; app code always
 * uses the default.
 */
export function matchFragments(
	fragments: OcrFragment[],
	index: CatalogIndex,
	constants: MatchConstants = MATCH_CONSTANTS,
): SpineMatch[] {
	// Pool all fragment tokens into one bag (union across lines and photos). Keep the
	// per-fragment sets for corroboration counting.
	const fragmentSets = fragments.map((f) => new Set(normalizeTokens(f.text)));
	const bag = new Set<string>();
	for (const set of fragmentSets) {
		for (const t of set) bag.add(t);
	}

	const scored: Scored[] = [];
	for (const entry of index.works) {
		// Title-coverage floor — a distinctive token alone is not enough; the title must
		// be substantially present.
		const required = Math.min(entry.titleTokens.size, constants.MIN_TITLE_TOKEN_COVERAGE);
		const observed = new Set<string>();
		for (const t of entry.titleTokens) {
			if (bag.has(t)) observed.add(t);
		}
		if (observed.size < required) continue;

		// Evidence-quality gate (multi-token titles): the title evidence must be locally
		// coherent — ≥2 title tokens together in ONE fragment (one spine line) — or rest
		// on ≥2 distinctive tokens. Otherwise the "match" is assembled from common tokens
		// scattered across unrelated spines ('wing' + 'solo' + 'command').
		if (entry.titleTokens.size >= 2) {
			let paired = false;
			for (const set of fragmentSets) {
				let hits = 0;
				for (const t of observed) {
					if (set.has(t)) hits++;
				}
				if (hits >= 2) {
					paired = true;
					break;
				}
			}
			if (!paired) {
				let distinctive = 0;
				for (const t of observed) {
					const df = entry.titleDf.get(t) ?? Number.POSITIVE_INFINITY;
					if (df <= constants.MAX_TITLE_TOKEN_DF) distinctive++;
				}
				if (distinctive < 2) continue;
			}
		}

		// IDF-weighted coverage of the work's tokens by the bag.
		let matched = 0;
		for (const [t, weight] of entry.tokens) {
			if (bag.has(t)) matched += weight;
		}
		const base = entry.totalIdf > 0 ? matched / entry.totalIdf : 0;
		if (base <= 0) continue;

		// Corroboration: distinct fragments contributing a title token (cross-photo).
		let supports = 0;
		for (const set of fragmentSets) {
			for (const t of entry.titleTokens) {
				if (set.has(t)) {
					supports++;
					break;
				}
			}
		}
		const boost =
			constants.SUPPORT_BOOST * Math.min(Math.max(supports - 1, 0), constants.SUPPORT_CAP);
		const score = Math.min(1, base + boost);
		scored.push({ entry, score, supports, observed });
	}

	scored.sort((a, b) => b.score - a.score);

	const matches: SpineMatch[] = [];
	for (let i = 0; i < scored.length; i++) {
		const current = scored[i];
		// Related candidates (any shared title token) are plausible swap alternates.
		const related = scored.filter(
			(other, j) => j !== i && shareTitleToken(current.entry, other.entry),
		);
		// But only SUPERSET-EVIDENCE candidates compete for confidence: a competitor must
		// explain everything this work's observed title evidence explains (it could be
		// the same spine misread). Series siblings with their own distinct evidence
		// ("…Revan" vs "…Deceived") no longer suppress each other.
		const supersets = related.filter((other) => isSubset(current.observed, other.observed));

		// Parasite drop: a candidate adds nothing when a competitor explains at least its
		// whole evidence AND beats it — strictly fuller evidence at an equal-or-better
		// score ("I, Jedi" riding the 'jedi' of "Return of the Jedi"), or the same
		// evidence at a strictly better score (the spine is ambiguous but corroboration
		// broke the tie). Dropped candidates still appear among the winner's alternates;
		// exact ties on equal evidence survive as a genuine near-tie (both demoted by
		// margin below).
		const dominated = supersets.some(
			(other) =>
				other.score > current.score ||
				(other.score === current.score && other.observed.size > current.observed.size),
		);
		if (dominated) continue;

		const bestCompetitor = supersets.reduce((max, c) => Math.max(max, c.score), 0);
		const margin = current.score - bestCompetitor;

		const bucket = classifyConfidence(current.score, margin, constants);
		if (!bucket) continue;

		const alternates = related
			.slice(0, constants.MAX_ALTERNATES)
			.map((c) => ({ book: c.entry.book, score: c.score }));

		matches.push({
			book: current.entry.book,
			score: current.score,
			margin,
			bucket,
			supports: current.supports,
			alternates,
		});
	}

	return matches;
}

function isSubset(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	if (a.size > b.size) return false;
	for (const t of a) {
		if (!b.has(t)) return false;
	}
	return true;
}

function shareTitleToken(a: WorkEntry, b: WorkEntry): boolean {
	for (const t of a.titleTokens) {
		if (b.titleTokens.has(t)) return true;
	}
	return false;
}
