import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { tokens } from '@/constants/tokens';
import type { ScanMode } from '@/lib/scan-mode';

const SEGMENTS: { mode: ScanMode; label: string }[] = [
	{ mode: 'barcode', label: 'Barcode' },
	{ mode: 'shelf', label: 'Shelf' },
];

/**
 * Segmented Barcode | Shelf control, floated over the camera feed (plan Phase 5
 * mode host). Shared chrome: each panel decides WHEN to show it and whether a
 * switch needs confirmation — this component only renders the choice. `onSwitch`
 * receives the target mode and is a no-op when it equals the current one.
 */
export function ScanModeSwitcher({
	mode,
	onSwitch,
}: {
	mode: ScanMode;
	onSwitch: (next: ScanMode) => void;
}) {
	return (
		<Animated.View
			style={styles.container}
			entering={FadeIn.duration(150)}
			pointerEvents="box-none"
		>
			<View style={styles.track} accessibilityRole="tablist">
				{SEGMENTS.map(({ mode: segment, label }) => {
					const active = segment === mode;
					return (
						<Pressable
							key={segment}
							style={[styles.segment, active && styles.segmentActive]}
							onPress={() => onSwitch(segment)}
							accessibilityRole="tab"
							accessibilityState={{ selected: active }}
							accessibilityLabel={`${label} scanning`}
						>
							<Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
						</Pressable>
					);
				})}
			</View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		alignItems: 'center',
	},
	track: {
		flexDirection: 'row',
		padding: 3,
		borderRadius: 22,
		gap: 3,
		// Dark backing so the control stays legible over a bright camera feed
		// (camera-overlay exception, same as the rest of the scan chrome).
		backgroundColor: 'rgba(0,0,0,0.55)',
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	segment: {
		paddingHorizontal: 22,
		paddingVertical: 9,
		borderRadius: 19,
	},
	segmentActive: {
		backgroundColor: tokens.accent.primary,
	},
	label: {
		color: tokens.text.primary,
		fontSize: 14,
		fontWeight: '600',
		opacity: 0.7,
	},
	labelActive: {
		color: tokens.text.primary,
		opacity: 1,
	},
});
