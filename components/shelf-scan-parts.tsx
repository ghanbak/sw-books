import { StyleSheet, View } from 'react-native';

import { HoloCover } from '@/components/holo-cover';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import type { Book } from '@/lib/hooks';
import { hiddenDecorationProps } from '@/lib/scan-a11y';

/**
 * A cover that is decoration inside a labelled, pressable row or tile: hidden from
 * screen readers and touch-transparent (see `hiddenDecorationProps`).
 */
export function DecorativeCover({
	book,
	width,
	height,
}: {
	book: Pick<Book, 'cover_image' | 'title' | 'author'>;
	width: number;
	height: number;
}) {
	return (
		<View {...hiddenDecorationProps}>
			<HoloCover
				coverUri={book.cover_image}
				title={book.title}
				author={book.author}
				width={width}
				height={height}
				accessibilityLabel=""
			/>
		</View>
	);
}

/** Small canon-blue pill marking a book the user already owns. */
export function OwnedBadge({ label }: { label: string }) {
	return (
		<View style={styles.badge}>
			<Text style={styles.text}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	badge: {
		alignSelf: 'flex-start',
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		backgroundColor: tokens.badge.canon,
		marginTop: 2,
	},
	text: {
		color: tokens.text.primary,
		fontSize: 10,
		fontWeight: '600',
	},
});
