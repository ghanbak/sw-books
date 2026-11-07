/**
 * Which body a catalog-backed tab renders. Pure so it unit-tests in the node vitest env.
 *
 * Rows already on screen win (a background refetch or failed refresh keeps them). With no
 * rows, loading beats error (a Retry shows the spinner), and "empty" only follows a
 * successful load.
 */
export type ListState = 'loading' | 'error' | 'empty' | 'list';

export function selectListState({
	loading,
	error,
	count,
}: {
	loading: boolean;
	error: string | null;
	count: number;
}): ListState {
	if (count > 0) return 'list';
	if (loading) return 'loading';
	if (error) return 'error';
	return 'empty';
}
