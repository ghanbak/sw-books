import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';

export const CARD_RADIUS = 12;
export const CARD_PADDING = 12;

/**
 * The dark card shell used by book rows, the book-detail grouping cards, and the
 * account card. The skeuomorphic `CardNotch` "datapad" footer (light bars + a
 * notched tab) is rendered at the bottom unless `notch={false}`.
 *
 * Geometry is a faithful approximation of Figma node 130:394 and is refined when
 * the cards are wired up against the design.
 */
export function Card({
	children,
	style,
	notch = true,
}: {
	children: ReactNode;
	style?: ViewStyle;
	notch?: boolean;
}) {
	return (
		<View style={[styles.card, style]}>
			<View style={styles.body}>{children}</View>
			{notch && <CardNotch />}
		</View>
	);
}

/** The datapad notch strip: accent "light bars" on the left, a notched tab on the right. */
export function CardNotch() {
	return (
		<View style={styles.notchStrip}>
			<View style={styles.lightBars}>
				<View style={[styles.bar, { width: 32 }]} />
				<View style={[styles.bar, { width: 8 }]} />
			</View>
			<View style={styles.notchTab} />
		</View>
	);
}

type CardTitleTrailing =
	| { kind: 'count'; value: number }
	| {
			kind: 'link';
			label: string;
			onPress: () => void;
			accessibilityLabel?: string;
			accessibilityHint?: string;
	  };

const LINK_HIT_SLOP = { top: 16, bottom: 16, left: 8, right: 8 } as const;

/**
 * Card title row (Figma `Enrichment / Card Title` 259:16): 11/13 bold uppercase,
 * `text.secondary`. Optional trailing count (tabular-nums) or "See all" text link in
 * `accent.primary` (no chevron, per frame 248:1397; ≥44pt hit target via hitSlop).
 */
export function CardTitle({
	children,
	trailing,
}: {
	children: string;
	trailing?: CardTitleTrailing;
}) {
	if (trailing?.kind === 'count') {
		return (
			<View
				style={styles.titleRow}
				accessible
				accessibilityRole="header"
				accessibilityLabel={`${children}, ${trailing.value.toLocaleString()}`}
			>
				<Text style={[styles.title, styles.titleText]}>{children}</Text>
				<Text style={[styles.title, styles.count]}>{trailing.value.toLocaleString()}</Text>
			</View>
		);
	}
	return (
		<View style={styles.titleRow}>
			<Text style={[styles.title, styles.titleText]} accessibilityRole="header">
				{children}
			</Text>
			{trailing?.kind === 'link' && (
				<Pressable
					onPress={trailing.onPress}
					hitSlop={LINK_HIT_SLOP}
					accessibilityRole="button"
					accessibilityLabel={trailing.accessibilityLabel ?? trailing.label}
					accessibilityHint={trailing.accessibilityHint}
					style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
				>
					<Text style={[styles.title, styles.linkText]}>{trailing.label}</Text>
				</Pressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: tokens.surface.card,
		borderRadius: CARD_RADIUS,
		borderWidth: 0,
		overflow: 'hidden',
	},
	body: {
		padding: CARD_PADDING,
	},
	notchStrip: {
		height: 12,
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		paddingHorizontal: 12,
		paddingRight: 24,
	},
	lightBars: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
	},
	bar: {
		height: 4,
		borderRadius: 2,
		backgroundColor: tokens.border.subtle,
	},
	notchTab: {
		width: 88,
		height: 12,
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		borderWidth: 0,
		borderBottomWidth: 0,
		borderColor: tokens.border.subtle,
		backgroundColor: tokens.surface.background,
	},
	titleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingBottom: 4,
	},
	title: {
		fontSize: 11,
		lineHeight: 13,
		fontWeight: '700',
		letterSpacing: 1.2,
	},
	titleText: {
		flex: 1,
		color: tokens.text.secondary,
		textTransform: 'uppercase',
	},
	count: {
		color: tokens.text.secondary,
		fontVariant: ['tabular-nums'],
	},
	link: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 3,
	},
	linkPressed: {
		opacity: 0.6,
	},
	linkText: {
		color: tokens.accent.primary,
	},
});
