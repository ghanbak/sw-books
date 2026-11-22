// New-book Search state transition (issue 362). Dependency-free so the root Vitest
// suite can cover it.

type SearchOutcome<T, E> = { ok: true; data: T } | { ok: false; error: E };

/**
 * Clear the previous results, then run the search in `start` (a transition).
 * The clear happens before `start`, outside the transition, so it commits on its
 * own: the status region empties then refills (a repeat search with the same
 * per-source outcome is announced again), and a failed search leaves no stale
 * candidate cards or Prefill buttons.
 */
export function runResettingSearch<T, E>(
	setResults: (results: T | null) => void,
	start: (action: () => Promise<void>) => void,
	search: () => Promise<SearchOutcome<T, E>>,
	onError: (error: E) => void,
): void {
	setResults(null);
	start(async () => {
		const res = await search();
		if (!res.ok) {
			onError(res.error);
			return;
		}
		setResults(res.data);
	});
}
