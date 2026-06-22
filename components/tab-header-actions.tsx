import { useRouter } from 'expo-router';
import { CircleUser, ListFilter, ScanBarcode } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { GlassIconButton } from '@/components/ui/glass-icon-button';

type Props = {
	/** Filter button shows only on Archives & Library. */
	showFilter?: boolean;
	/** Filter tap handler — wired to the sort dropdown in a later step. */
	onFilter?: () => void;
};

/**
 * The circular header-action cluster (filter / scan / profile) that lives in each
 * tab's native large-title header `headerRight`. Scan opens the full-screen scan
 * modal; profile opens the account bottom sheet.
 */
export function TabHeaderActions({ showFilter = false, onFilter }: Props) {
	const router = useRouter();
	return (
		<View style={styles.row}>
			{showFilter && (
				<GlassIconButton
					icon={ListFilter}
					accessibilityLabel="Filter and sort"
					// TODO(plan step: filter dropdown) — wire the sort dropdown menu.
					onPress={onFilter ?? (() => {})}
				/>
			)}
			<GlassIconButton
				icon={ScanBarcode}
				accessibilityLabel="Scan a book"
				onPress={() => router.push('/scan')}
			/>
			<GlassIconButton
				icon={CircleUser}
				accessibilityLabel="Account and settings"
				onPress={() => router.push('/profile')}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
});
