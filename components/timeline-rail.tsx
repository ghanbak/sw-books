import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '@/constants/tokens';
import type { TimelineGroup } from '@/lib/timeline';

const PITCH = 28;

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
}: {
	groups: TimelineGroup[];
	activeIndex: number;
	width: number;
}) {
	const active = groups[activeIndex];
	// Center the active tick under the hero.
	const translateX = width / 2 - (activeIndex * PITCH + PITCH / 2);

	return (
		<View style={styles.wrap}>
			<View style={styles.ticksWindow}>
				<View style={[styles.row, { transform: [{ translateX }] }]}>
					{groups.map((g, i) => (
						<View key={g.order} style={styles.slot}>
							<View style={i === activeIndex ? styles.tickActive : styles.tick} />
						</View>
					))}
				</View>
			</View>
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
		width: PITCH,
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
