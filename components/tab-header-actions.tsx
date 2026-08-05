import { Stack, useRouter } from 'expo-router';

type Props = {
	/** Filter button shows only on Archives & Library. */
	showFilter?: boolean;
	/** Filter tap handler — opens the sort menu. */
	onFilter?: () => void;
};

/**
 * The tab header-action cluster (filter / scan / profile) as native right-placement
 * `Stack.Toolbar` bar buttons — the system renders them as real bar-button items with their
 * own glass, matching the favorite and Back buttons. Render this inside the screen body (not
 * via `headerRight`): a `Stack.Toolbar` is screen-scoped config, not a header view.
 */
export function TabHeaderActions({ showFilter = false, onFilter }: Props) {
	const router = useRouter();
	return (
		<Stack.Toolbar placement="right">
			{showFilter && (
				<Stack.Toolbar.Button
					icon="line.3.horizontal.decrease"
					accessibilityLabel="Filter and sort"
					onPress={onFilter ?? (() => {})}
				/>
			)}
			<Stack.Toolbar.Button
				icon="barcode.viewfinder"
				accessibilityLabel="Scan a book"
				onPress={() => router.push('/scan')}
			/>
			<Stack.Toolbar.Button
				icon="person.crop.circle"
				accessibilityLabel="Account and settings"
				onPress={() => router.push('/profile')}
			/>
		</Stack.Toolbar>
	);
}
