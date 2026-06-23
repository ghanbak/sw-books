import { useRouter } from 'expo-router';
import { CircleUser, type LucideIcon, ListFilter, ScanBarcode } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { tokens } from '@/constants/tokens';

type Props = {
	/** Filter button shows only on Archives & Library. */
	showFilter?: boolean;
	/** Filter tap handler — wired to the sort dropdown in a later step. */
	onFilter?: () => void;
};

/**
 * The header-action cluster (filter / scan / profile) that lives in each tab's
 * native large-title header `headerRight`. Plain tinted glyphs — no custom
 * background container, so they read as standard iOS bar-button items. Scan opens
 * the full-screen scan modal; profile opens the account bottom sheet.
 */
export function TabHeaderActions({ showFilter = false, onFilter }: Props) {
	const router = useRouter();
	return (
		<View style={styles.row}>
			{showFilter && (
				<HeaderIconButton
					icon={ListFilter}
					accessibilityLabel="Filter and sort"
					// TODO(plan step: filter dropdown) — wire the sort dropdown menu.
					onPress={onFilter ?? (() => {})}
				/>
			)}
			<HeaderIconButton
				icon={ScanBarcode}
				accessibilityLabel="Scan a book"
				onPress={() => router.push('/scan')}
			/>
			<HeaderIconButton
				icon={CircleUser}
				accessibilityLabel="Account and settings"
				onPress={() => router.push('/profile')}
			/>
		</View>
	);
}

function HeaderIconButton({
	icon: Icon,
	accessibilityLabel,
	onPress,
}: {
	icon: LucideIcon;
	accessibilityLabel: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			hitSlop={8}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			style={({ pressed }) => [styles.button, pressed && styles.pressed]}
		>
			<Icon size={22} color={tokens.text.primary} strokeWidth={2} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 18,
	},
	button: {
		alignItems: 'center',
		justifyContent: 'center',
	},
	pressed: {
		opacity: 0.4,
	},
});
