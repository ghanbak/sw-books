import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type CatalogSort, DEFAULT_SORT, parseStoredSort } from '@/lib/sort';

export const SORT_OPTIONS: readonly { sort: CatalogSort; label: string }[] = [
	{ sort: { field: 'timeline_order', direction: 'asc' }, label: 'Chronological — Oldest first' },
	{ sort: { field: 'timeline_order', direction: 'desc' }, label: 'Chronological — Newest first' },
	{ sort: { field: 'date_published', direction: 'asc' }, label: 'Publish Date — Oldest first' },
	{ sort: { field: 'date_published', direction: 'desc' }, label: 'Publish Date — Newest first' },
];

export const isSameSort = (a: CatalogSort, b: CatalogSort) =>
	a.field === b.field && a.direction === b.direction;

/**
 * Catalog sort state, rendered as the header sort menu (`TabHeaderActions`). The chosen sort
 * persists across launches under `storageKey` (pass distinct keys so separate lists — Archives
 * vs Library — sort independently). Hydration happens once on mount, inside the catalog's
 * loading window, so the list never visibly reorders.
 */
export function useCatalogSort(storageKey: string) {
	const [sort, setSort] = useState<CatalogSort>(DEFAULT_SORT);

	const hydrated = useRef(false);
	useEffect(() => {
		if (hydrated.current) return;
		hydrated.current = true;
		AsyncStorage.getItem(storageKey).then((raw) => setSort(parseStoredSort(raw)));
	}, [storageKey]);

	const selectSort = useCallback(
		(next: CatalogSort) => {
			setSort(next);
			AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
		},
		[storageKey],
	);

	return { sort, selectSort };
}
