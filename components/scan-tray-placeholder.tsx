import { ScrollView, StyleSheet, View } from 'react-native';

import { HoloCover } from '@/components/holo-cover';
import type { Book } from '@/lib/hooks';
import { hiddenDecorationProps } from '@/lib/scan-a11y';

const COVER_WIDTH = 64;
const COVER_HEIGHT = 96;

/**
 * Stand-in for #75's `components/scan-tray.tsx` (same props: `books`, newest at index 0
 * = left). Plain hscroll, no enter animation or blur. Swap the import once #75 lands on
 * the feature branch.
 */
export function ScanTray({ books }: { books: Book[] }) {
	if (books.length === 0) return null;
	return (
		<View
			accessible
			accessibilityLabel={`${books.length} ${books.length === 1 ? 'book' : 'books'} captured`}
		>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.row}
			>
				{books.map((b) => (
					<View key={b.id} style={styles.cover} {...hiddenDecorationProps}>
						<HoloCover
							coverUri={b.cover_image}
							title={b.title}
							author={b.author}
							width={COVER_WIDTH}
							height={COVER_HEIGHT}
						/>
					</View>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		paddingHorizontal: 16,
		gap: 8,
	},
	cover: {
		opacity: 0.9,
	},
});
