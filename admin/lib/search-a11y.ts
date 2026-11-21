// Screen-reader text for the new-book search results (#356). Pure so the root Vitest
// suite can cover it without a DOM. Types are structural: the root suite can't resolve
// the admin's path aliases.

type CandidateLike = {
	isbn?: string[] | null;
	publisher?: string | null;
	date_published?: string | null;
};

/** A source returned nothing usable: no ISBN, publisher or publish date. */
export function candidateIsEmpty(c: CandidateLike): boolean {
	return !c.isbn?.length && !c.publisher && !c.date_published;
}

/** Spoken summary for the search `role="status"` region; empty before any search. */
export function searchStatusLabel(
	results: { ol: CandidateLike; gb: CandidateLike } | null,
): string {
	if (!results) return '';
	const outcome = (c: CandidateLike) => (candidateIsEmpty(c) ? 'no match' : 'match');
	return `Open Library: ${outcome(results.ol)}. Google Books: ${outcome(results.gb)}.`;
}

/** Accessible name for a candidate card's Prefill button. */
export function prefillLabel(source: string): string {
	return `Prefill from ${source}`;
}
