import { Check, X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoloCover } from '@/components/holo-cover';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import type { Book } from '@/lib/hooks';

/**
 * The "N books added" confirmation that floats over the scanner camera (Figma
 * 153:2606 / 153:2510): close X, a title, a horizontal row of scanned covers, and a
 * blue checkmark to confirm. Presentational — the caller owns confirm/dismiss and what
 * "confirm" does (add to library). Tapping a cover opens that book.
 */
export function AddedBooksSheet({
	title,
	books,
	onConfirm,
	onDismiss,
	onSelectBook,
}: {
	title: string;
	books: Book[];
	onConfirm: () => void;
	onDismiss: () => void;
	onSelectBook?: (bookId: string) => void;
}) {
	const insets = useSafeAreaInsets();
	return (
		<View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
			<View style={styles.header}>
				<Pressable
					style={styles.iconBtn}
					onPress={onDismiss}
					accessibilityRole="button"
					accessibilityLabel="Dismiss"
				>
					<X size={18} color={tokens.text.primary} strokeWidth={2} />
				</Pressable>
				<Text style={styles.title}>{title}</Text>
				<Pressable
					style={[styles.iconBtn, styles.confirm]}
					onPress={onConfirm}
					accessibilityRole="button"
					accessibilityLabel="Add to library"
				>
					<Check size={18} color={tokens.text.inverse} strokeWidth={2.5} />
				</Pressable>
			</View>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.covers}
			>
				{books.map((b) => (
					<HoloCover
						key={b.id}
						variant="thumb"
						coverUri={b.cover_image}
						title={b.title}
						author={b.author}
						width={96}
						height={144}
						onPress={onSelectBook ? () => onSelectBook(b.id) : undefined}
						accessibilityLabel={b.title}
					/>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	sheet: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: tokens.surface.card,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
		paddingHorizontal: 16,
		paddingTop: 14,
		gap: 14,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	title: {
		fontSize: 16,
		fontWeight: '600',
		color: tokens.text.primary,
	},
	iconBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: tokens.surface.background,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
	},
	confirm: {
		backgroundColor: tokens.accent.primary,
		borderColor: tokens.accent.primary,
	},
	covers: {
		gap: 12,
		paddingVertical: 4,
	},
});
