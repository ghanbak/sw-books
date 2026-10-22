/**
 * Resolve a discovered book's `type` (the DB `NOT NULL CHECK` audience tier)
 * from Open Library / Google Books audience signals. Pure: the signals are
 * fetched by `lib/sources/lookup.ts#fetchAudienceSignals` and passed in.
 *
 * Wookieepedia's Legends bucket carries no tier, so Legends rows need this.
 * The rule is evidence-only — it never guesses:
 *   - a search hit counts only when its title AND an author surname match the
 *     book (an ISBN-anchored hit is trusted: the wiki ISBN fixes identity);
 *   - each counted signal maps to one label — `ya` (a "young adult" label),
 *     `juvenile` ("juvenile"/"children's"), or `adult` (Google's BISAC top
 *     level "Fiction", or OL fiction subjects with no juvenile/YA term);
 *   - Google Books (publisher BISAC) outranks Open Library: OL work subjects
 *     aggregate every edition, so an adult Legends novel often carries a
 *     "Juvenile fiction" subject from a kids' reissue. OL labels are used only
 *     when no counted GB signal carries a label;
 *   - only ONE consistent label decides: adult → Adult Novel, ya → YA Novel.
 *     `juvenile` alone can't tell Middle Grade from YA, and mixed labels
 *     conflict, so both — like no evidence at all — return `type: null`
 *     (the changeset marks the row `needs_type`).
 */
import type { AudienceSignal } from '../sources/lookup';
import type { BookType } from './categories';
import { authorSurnameSet, titlesCorrespond } from './match';

export type AudienceLabel = 'adult' | 'ya' | 'juvenile';

export type AudienceEvidence = {
	readonly source: AudienceSignal['source'];
	readonly via: AudienceSignal['via'];
	readonly matched_title: string;
	/** The label this signal contributed, or null when it carried none. */
	readonly label: AudienceLabel | null;
	/** Why a signal was ignored (wrong-book search hit), else null. */
	readonly rejected: string | null;
};

export type TypeDecision = {
	readonly type: BookType | null;
	readonly reason: string;
	readonly evidence: readonly AudienceEvidence[];
};

const YA = /young adult/i;
const JUVENILE = /juvenile|children'?s/i;

/** The audience label one signal carries, or null when it carries none. */
export function labelOf(signal: Pick<AudienceSignal, 'source' | 'labels'>): AudienceLabel | null {
	const labels = signal.labels;
	if (labels.some((l) => YA.test(l))) return 'ya';
	if (labels.some((l) => JUVENILE.test(l))) return 'juvenile';
	if (signal.source === 'google-books') {
		// BISAC: adult fiction is the top-level "Fiction"; JUV/YAF are separate roots.
		return labels.some((l) => /^fiction\b/i.test(l.trim())) ? 'adult' : null;
	}
	return labels.some((l) => /fiction/i.test(l)) ? 'adult' : null;
}

/** Drop a "Star Wars"/"Star Wars Legends" brand segment so a GB title like
 *  "Tatooine Ghost: Star Wars Legends" corresponds to "Tatooine Ghost". */
function debrand(title: string): string {
	return title
		.replace(/\s*\([^)]*\)\s*$/, '') // trailing "(Coruscant Nights, Book II)" / "(Star Wars)"
		.replace(/^star wars,\s*/i, '') // "Star Wars, Legacy of the Force: Inferno"
		.replace(/:\s*star wars(?: legends)?\s*(?=:|$)/gi, '') // "…: Star Wars Legends"
		.trim();
}

/** Whether a search hit is the same book (title corresponds + an author surname overlaps). */
export function hitMatchesBook(
	signal: Pick<AudienceSignal, 'matchedTitle' | 'matchedAuthors'>,
	book: { readonly title: string; readonly author: readonly string[] | null },
): boolean {
	if (!titlesCorrespond(debrand(signal.matchedTitle), debrand(book.title))) return false;
	const hit = authorSurnameSet(signal.matchedAuthors);
	for (const s of authorSurnameSet(book.author)) if (hit.has(s)) return true;
	return false;
}

const TYPE_FOR: Readonly<Record<'adult' | 'ya', BookType>> = {
	adult: 'Adult Novel',
	ya: 'YA Novel',
};

/** Decide `type` from the signals; `type: null` whenever the evidence isn't decisive. */
export function decideType(
	signals: readonly AudienceSignal[],
	book: { readonly title: string; readonly author: readonly string[] | null },
): TypeDecision {
	const evidence: AudienceEvidence[] = signals.map((s) => {
		const ok = s.via === 'isbn' || hitMatchesBook(s, book);
		return {
			source: s.source,
			via: s.via,
			matched_title: s.matchedTitle,
			label: ok ? labelOf(s) : null,
			rejected: ok ? null : 'search hit is a different book (title/author mismatch)',
		};
	});
	const labelsFrom = (source: AudienceSignal['source']) =>
		new Set(evidence.flatMap((e) => (e.label && e.source === source ? [e.label] : [])));
	const gb = labelsFrom('google-books');
	const labels = gb.size ? gb : labelsFrom('open-library');
	if (labels.size === 0) return { type: null, reason: 'no usable audience evidence', evidence };
	if (labels.size > 1) {
		return {
			type: null,
			reason: `conflicting audience evidence (${[...labels].sort().join(', ')})`,
			evidence,
		};
	}
	const only = [...labels][0] as AudienceLabel;
	if (only === 'juvenile') {
		return {
			type: null,
			reason: 'juvenile only — cannot tell Middle Grade from YA',
			evidence,
		};
	}
	return { type: TYPE_FOR[only], reason: `all usable evidence says ${only}`, evidence };
}
