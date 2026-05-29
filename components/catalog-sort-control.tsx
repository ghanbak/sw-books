import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { ActionSheetIOS, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/constants/tokens';
import { type CatalogSort, parseStoredSort } from '@/lib/sort';

const STORAGE_KEY = '@ossus/catalog_sort';

const OPTIONS: { sort: CatalogSort; label: string }[] = [
	{ sort: { field: 'timeline_order', direction: 'asc' }, label: 'Chronological — Oldest first' },
	{ sort: { field: 'timeline_order', direction: 'desc' }, label: 'Chronological — Newest first' },
	{ sort: { field: 'date_published', direction: 'asc' }, label: 'Publish Date — Oldest first' },
	{ sort: { field: 'date_published', direction: 'desc' }, label: 'Publish Date — Newest first' },
];

const FIELD_LABEL: Record<CatalogSort['field'], string> = {
	timeline_order: 'Chronological',
	date_published: 'Publish Date',
};

const indexOfSort = (sort: CatalogSort) =>
	OPTIONS.findIndex((o) => o.sort.field === sort.field && o.sort.direction === sort.direction);

type Props = {
	value: CatalogSort;
	onChange: (sort: CatalogSort) => void;
};

/**
 * Right-aligned pill that opens a native iOS action sheet to pick the catalog sort. The
 * chosen sort persists across launches via AsyncStorage; hydration happens on mount, inside
 * the catalog's existing loading window, so the list never visibly reorders.
 *
 * Non-iOS has no ActionSheetIOS, so the pill cycles through the four sort modes on tap.
 */
export function CatalogSortControl({ value, onChange }: Props) {
	// Hydrate the persisted sort once on mount. The ref guard keeps this to a single run
	// while still satisfying exhaustive-deps with onChange in the dependency array.
	const hydrated = useRef(false);
	useEffect(() => {
		if (hydrated.current) return;
		hydrated.current = true;
		AsyncStorage.getItem(STORAGE_KEY).then((raw) => onChange(parseStoredSort(raw)));
	}, [onChange]);

	const select = useCallback(
		(next: CatalogSort) => {
			onChange(next);
			AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
		},
		[onChange],
	);

	const handlePress = useCallback(() => {
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
		const current = indexOfSort(value);
		select(OPTIONS[(current + 1) % OPTIONS.length].sort);
	}, [value, select]);

	const Arrow = value.direction === 'asc' ? ArrowUp : ArrowDown;
	const directionLabel = value.direction === 'asc' ? 'oldest first' : 'newest first';

	return (
		<Pressable
			style={styles.pill}
			onPress={handlePress}
			accessibilityRole="button"
			accessibilityLabel={`Sort: ${FIELD_LABEL[value.field]}, ${directionLabel}`}
		>
			<Text style={styles.label}>{FIELD_LABEL[value.field]}</Text>
			<Arrow size={14} color={tokens.accent.primary} strokeWidth={2.5} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	pill: {
		marginLeft: 'auto',
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	label: {
		fontSize: 13,
		fontWeight: '500',
		color: tokens.text.primary,
	},
});
