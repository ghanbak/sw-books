import { StyleSheet, View } from 'react-native';

import { Card, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import {
	type TimelineSegment,
	timelineAccessibilityLabel,
} from '@/lib/wookieepedia/enrichment-display';

/**
 * In-universe timeline from Wookieepedia (`timeline_notes`). One segment reads large;
 * multi-part timelines (e.g. *Darth Plagueis*) get one row per segment. Not interactive.
 */
export function TimelineCard({ segments }: { segments: readonly TimelineSegment[] }) {
	const multi = segments.length > 1;
	return (
		<Card>
			<CardTitle>Timeline</CardTitle>
			<View accessible accessibilityLabel={timelineAccessibilityLabel(segments)}>
				{segments.map((segment, i) => (
					<View
						// biome-ignore lint/suspicious/noArrayIndexKey: positional segments, never reordered
						key={i}
						style={[multi ? styles.multiRow : styles.singleRow, multi && i > 0 && styles.divider]}
					>
						<Text style={multi ? styles.rangeMulti : styles.rangeSingle}>{segment.range}</Text>
						{segment.label ? <Text style={styles.label}>{segment.label}</Text> : null}
					</View>
				))}
			</View>
		</Card>
	);
}

const styles = StyleSheet.create({
	singleRow: {
		paddingVertical: 8,
	},
	multiRow: {
		paddingVertical: 10,
	},
	divider: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: tokens.border.subtle,
	},
	rangeSingle: {
		fontSize: 17,
		lineHeight: 22,
		fontWeight: '600',
		letterSpacing: -0.43,
		color: tokens.text.primary,
		fontVariant: ['tabular-nums'],
	},
	rangeMulti: {
		fontSize: 15,
		lineHeight: 20,
		fontWeight: '600',
		letterSpacing: -0.23,
		color: tokens.text.primary,
		fontVariant: ['tabular-nums'],
	},
	label: {
		marginTop: 2,
		fontSize: 13,
		lineHeight: 18,
		color: tokens.text.secondary,
	},
});
