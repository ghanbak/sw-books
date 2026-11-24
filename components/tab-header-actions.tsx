import { Stack, useRouter } from 'expo-router';

import { SORT_OPTIONS, isSameSort } from '@/hooks/useCatalogSort';
import { useToolbarIcon } from '@/hooks/useToolbarIcon';
import type { CatalogSort } from '@/lib/sort';

type Props = {
	/** Active sort — when set with `onSortChange`, shows the sort menu (Archives & Library). */
	sort?: CatalogSort;
	onSortChange?: (sort: CatalogSort) => void;
};

/**
 * The tab header-action cluster (sort / scan / profile) as native right-placement
 * `Stack.Toolbar` items — the system renders them as real bar-button items with their own
 * glass, matching the favorite and Back buttons. Render this inside the screen body (not via
 * `headerRight`): a `Stack.Toolbar` is screen-scoped config, not a header view. Items must be
 * direct `Stack.Toolbar.*` children — the toolbar drops wrapper components.
 *
 * Sort is a native menu (UIMenu on iOS, Compose DropdownMenu on Android); the active option
 * carries the system checkmark via `isOn`. Android's toolbar drops SF Symbols, so every item
 * takes its icon from `useToolbarIcon` (a rendered Material Symbol there) and stays hidden until
 * that glyph is ready.
 */
export function TabHeaderActions({ sort, onSortChange }: Props) {
	const router = useRouter();
	const sortIcon = useToolbarIcon('line.3.horizontal.decrease');
	const scanIcon = useToolbarIcon('barcode.viewfinder');
	const profileIcon = useToolbarIcon('person.crop.circle');

	const sortActions =
		sort && onSortChange
			? SORT_OPTIONS.map((option) => (
					<Stack.Toolbar.MenuAction
						key={option.label}
						isOn={isSameSort(option.sort, sort)}
						onPress={() => onSortChange(option.sort)}
					>
						{option.label}
					</Stack.Toolbar.MenuAction>
				))
			: null;

	return (
		<Stack.Toolbar placement="right">
			{sortIcon && sortActions && (
				<Stack.Toolbar.Menu icon={sortIcon} accessibilityLabel="Sort">
					{/* iOS: a titled inline section is the menu header. Android drops inline titles
					    and prepends a divider, so the actions sit at the root there. */}
					{process.env.EXPO_OS === 'ios' ? (
						<Stack.Toolbar.Menu inline title="Sort by">
							{sortActions}
						</Stack.Toolbar.Menu>
					) : (
						sortActions
					)}
				</Stack.Toolbar.Menu>
			)}
			{scanIcon && (
				<Stack.Toolbar.Button
					icon={scanIcon}
					accessibilityLabel="Scan a book"
					onPress={() => router.push('/scan')}
				/>
			)}
			{profileIcon && (
				<Stack.Toolbar.Button
					icon={profileIcon}
					accessibilityLabel="Account and settings"
					onPress={() => router.push('/profile')}
				/>
			)}
		</Stack.Toolbar>
	);
}
