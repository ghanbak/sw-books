import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Platform } from 'react-native';

import { type CatalogSort, DEFAULT_SORT, parseStoredSort } from '@/lib/sort';

const OPTIONS: { sort: CatalogSort; label: string }[] = [
	{ sort: { field: 'timeline_order', direction: 'asc' }, label: 'Chronological — Oldest first' },
	{ sort: { field: 'timeline_order', direction: 'desc' }, label: 'Chronological — Newest first' },
	{ sort: { field: 'date_published', direction: 'asc' }, label: 'Publish Date — Oldest first' },
	{ sort: { field: 'date_published', direction: 'desc' }, label: 'Publish Date — Newest first' },
];

const indexOfSort = (sort: CatalogSort) =>
	OPTIONS.findIndex((o) => o.sort.field === sort.field && o.sort.direction === sort.direction);

/**
 * Catalog sort state + its native picker, wired to the header filter button. The chosen sort
 * persists across launches under `storageKey` (pass distinct keys so separate lists — Archives
 * vs Library — sort independently). On iOS `openSortMenu` shows a native action sheet; elsewhere
 * it advances to the next mode (no ActionSheetIOS). Hydration happens once on mount, inside the
 * catalog's loading window, so the list never visibly reorders.
 */
export function useCatalogSort(storageKey: string) {
	const [sort, setSort] = useState<CatalogSort>(DEFAULT_SORT);

	const hydrated = useRef(false);
	useEffect(() => {
		if (hydrated.current) return;
		hydrated.current = true;
		AsyncStorage.getItem(storageKey).then((raw) => setSort(parseStoredSort(raw)));
	}, [storageKey]);

	const select = useCallback(
		(next: CatalogSort) => {
			setSort(next);
			AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
		},
		[storageKey],
	);

	const openSortMenu = useCallback(() => {
		if (Platform.OS === 'ios') {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					options: [...OPTIONS.map((o) => o.label), 'Cancel'],
					cancelButtonIndex: OPTIONS.length,
					title: 'Sort by',
					userInterfaceStyle: 'dark',
				},
				(index) => {
					if (index < OPTIONS.length) select(OPTIONS[index].sort);
				},
			);
			return;
		}
		// Non-iOS fallback: advance to the next sort mode.
		setSort((current) => {
			const next = OPTIONS[(indexOfSort(current) + 1) % OPTIONS.length].sort;
			AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
			return next;
		});
	}, [select, storageKey]);

	return { sort, openSortMenu };
}
