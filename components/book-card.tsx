import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Book3D } from '@/components/Book3D';
import { tokens } from '@/constants/tokens';
import type { Book } from '@/lib/hooks';

interface BookCardProps {
	book: Book;
}

export const BookCard = memo(function BookCard({ book }: BookCardProps) {
	const router = useRouter();

	return (
		<Pressable
			style={({ pressed }) => [styles.container, pressed && styles.pressed]}
			onPress={() => router.push(`/book/${book.id}`)}
			accessibilityLabel={`${book.title} by ${book.author.join(', ')}`}
			accessibilityRole="button"
		>
			<Book3D
				coverUri={book.cover_image}
				title={book.title}
				author={book.author}
				width={72}
				height={108}
				accessibilityLabel=""
			/>
			<View style={styles.info}>
				<Text style={styles.title} numberOfLines={2}>
					{book.title}
				</Text>
				<Text style={styles.author} numberOfLines={1}>
					{book.author.join(', ')}
				</Text>
				<View style={styles.metaRow}>
					<View
						style={[styles.badge, book.canon === 'Canon' ? styles.canonBadge : styles.legendsBadge]}
					>
						<Text style={styles.badgeText}>{book.canon}</Text>
					</View>
					{book.series_name && (
						<Text style={styles.series} numberOfLines={1}>
							{book.series_name}
						</Text>
					)}
				</View>
			</View>
			<ChevronRight size={16} color={tokens.text.hint} strokeWidth={2} />
		</Pressable>
	);
});

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		paddingVertical: 10,
		paddingHorizontal: 12,
		gap: 14,
		alignItems: 'center',
	},
	pressed: {
		backgroundColor: tokens.surface.card,
	},
	info: {
		flex: 1,
		justifyContent: 'center',
		gap: 3,
	},
	title: {
		fontSize: 15,
		fontWeight: '600',
		color: tokens.text.primary,
	},
	author: {
		fontSize: 13,
		color: tokens.text.secondary,
	},
	metaRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		marginTop: 3,
	},
	badge: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	canonBadge: {
		backgroundColor: tokens.badge.canon,
	},
	legendsBadge: {
		backgroundColor: tokens.badge.legends,
	},
	badgeText: {
		color: tokens.text.primary,
		fontSize: 10,
		fontWeight: '600',
	},
	series: {
		fontSize: 11,
		color: tokens.text.hint,
		flex: 1,
	},
});
