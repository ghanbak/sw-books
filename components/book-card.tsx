import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Book3D } from '@/components/Book3D';
import { tokens } from '@/constants/tokens';
import type { Book } from '@/lib/hooks';

interface BookCardProps {
	book: Book;
}

export function BookCard({ book }: BookCardProps) {
	const router = useRouter();

	return (
		<View style={styles.container}>
			<Book3D
				coverUri={book.cover_image}
				title={book.title}
				author={book.author}
				width={80}
				height={120}
				onPress={() => router.push(`/book/${book.id}`)}
				accessibilityLabel={`Book cover: ${book.title} by ${book.author.join(', ')}`}
			/>
			<View style={styles.info}>
				<Text style={styles.title} numberOfLines={2}>
					{book.title}
				</Text>
				<Text style={styles.author} numberOfLines={1}>
					{book.author.join(', ')}
				</Text>
				<View style={styles.badges}>
					<View
						style={[
							styles.badge,
							book.canon === 'Canon' ? styles.canonBadge : styles.legendsBadge,
						]}
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
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		padding: 12,
		gap: 16,
		alignItems: 'center',
	},
	info: {
		flex: 1,
		justifyContent: 'center',
		gap: 4,
	},
	title: {
		fontSize: 16,
		fontWeight: '600',
		color: tokens.text.primary,
	},
	author: {
		fontSize: 13,
		color: tokens.text.secondary,
	},
	badges: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		marginTop: 4,
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
		color: '#fff',
		fontSize: 10,
		fontWeight: '600',
	},
	series: {
		fontSize: 11,
		color: tokens.text.hint,
		flex: 1,
	},
});
