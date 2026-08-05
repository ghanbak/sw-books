import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import {
	RAIL_PITCH,
	type TimelineGroup,
	clampIndex,
	indexAtScreenX,
	railTranslateX,
} from '@/lib/timeline';

/**
 * The notch rail beneath the Timeline hero. One tick per year-with-books, evenly
 * spaced (index-spaced, not to-scale — gaps between dates can be millennia). The
 * active group's tick is tall + blue and carries the date label; the row is
 * translated so the active tick stays centered as you page.
 */
export function TimelineRail({
	groups,
	activeIndex,
	width,
	onJump,
}: {
	groups: TimelineGroup[];
	activeIndex: number;
	width: number;
	/** Jump the pager to a page — fired when the user taps a notch on the rail. */
	onJump: (page: number) => void;
}) {
	const active = groups[activeIndex];
	// Center the active tick under the hero.
	const translateX = railTranslateX(width, activeIndex);

	// Tap anywhere on the rail → jump to the nearest notch's first page. scrollToIndex is a
	// JS/native call, so hop off the gesture's UI-thread callback with runOnJS.
	const jumpToTap = (x: number) => {
		const group = groups[clampIndex(Math.round(indexAtScreenX(x, translateX)), groups.length)];
		if (group) onJump(group.firstPage);
	};
	const tap = Gesture.Tap().onEnd((e) => {
		runOnJS(jumpToTap)(e.x);
	});

	return (
		<View style={styles.wrap}>
			<GestureDetector gesture={tap}>
				<View style={styles.ticksWindow}>
					<View style={[styles.row, { transform: [{ translateX }] }]}>
						{groups.map((g, i) => (
							<View key={g.order} style={styles.slot}>
								<View style={i === activeIndex ? styles.tickActive : styles.tick} />
							</View>
						))}
					</View>
				</View>
			</GestureDetector>
			{active && <Text style={styles.label}>{active.label}</Text>}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		paddingVertical: 12,
		alignItems: 'center',
		gap: 8,
	},
	ticksWindow: {
		width: '100%',
		height: 32,
		overflow: 'hidden',
		justifyContent: 'center',
	},
	row: {
		position: 'absolute',
		left: 0,
		flexDirection: 'row',
		alignItems: 'center',
	},
	slot: {
		width: RAIL_PITCH,
		alignItems: 'center',
	},
	tick: {
		width: 3,
		height: 12,
		borderRadius: 2,
		backgroundColor: tokens.text.hint,
	},
	tickActive: {
		width: 4,
		height: 28,
		borderRadius: 2,
		backgroundColor: tokens.accent.primary,
	},
	label: {
		fontSize: 13,
		fontWeight: '600',
		color: tokens.text.secondary,
		fontVariant: ['tabular-nums'],
	},
});
