import type { ListState } from '@/lib/list-state';

/**
 * What VoiceOver/TalkBack should say about the Search tab's results, or null to stay silent:
 * nothing for an empty query, or until the catalog has loaded (no results yet isn't "no match").
 * Pure so it unit-tests in the node vitest env; the screen only debounces it into `announce()`.
 */
export function searchAnnouncement({
	query,
	catalogState,
	count,
}: {
	query: string;
	catalogState: ListState;
	count: number;
}): string | null {
	if (query.trim().length === 0) return null;
	if (catalogState === 'loading' || catalogState === 'error') return null;
	if (count === 0) return 'No matches';
	return `${count.toLocaleString()} ${count === 1 ? 'match' : 'matches'}`;
}
