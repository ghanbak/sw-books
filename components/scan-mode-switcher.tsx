import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { StyleSheet, View } from 'react-native';

import { tokens } from '@/constants/tokens';
import type { ScanMode } from '@/lib/scan-mode';

const SEGMENTS: { mode: ScanMode; label: string }[] = [
	{ mode: 'barcode', label: 'Barcode' },
	{ mode: 'shelf', label: 'Shelf' },
];
const LABELS = SEGMENTS.map((s) => s.label);

/**
 * Barcode | Shelf control floated over the camera, as a native @expo/ui SegmentedControl.
 * `onSwitch` receives the target mode; the parent decides when to show it and whether a
 * switch needs confirmation. v1 native pass — the native control replaces the custom glassy
 * switcher; verify the dark look reads over the live camera on a device.
 */
export function ScanModeSwitcher({
	mode,
	onSwitch,
}: {
	mode: ScanMode;
	onSwitch: (next: ScanMode) => void;
}) {
	return (
		<View style={styles.container} pointerEvents="box-none">
			<SegmentedControl
				style={styles.control}
				values={LABELS}
				selectedIndex={SEGMENTS.findIndex((s) => s.mode === mode)}
				appearance="dark"
				tintColor={tokens.accent.primary}
				onValueChange={(value) => {
					const next = SEGMENTS.find((s) => s.label === value)?.mode;
					if (next && next !== mode) onSwitch(next);
				}}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		alignItems: 'center',
	},
	control: {
		width: 240,
	},
});
