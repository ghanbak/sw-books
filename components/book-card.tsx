import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Book } from '@/lib/hooks';

const COVER_COLORS = [
	'#8B0000',
	'#1a3a5c',
	'#2d4a22',
	'#4a2545',
	'#5c3a1a',
	'#1a4a4a',
	'#3d2b1f',
	'#4a1a1a',
	'#1a2a4a',
	'#3a1a4a',
];

function getCoverColor(title: string): string {
	let hash = 0;
	for (let i = 0; i < title.length; i++) {
		hash = (hash << 5) - hash + title.charCodeAt(i);
		hash |= 0;
	}
	return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
}

interface BookCardProps {
	book: Book;
}

export function BookCard({ book }: BookCardProps) {
	const router = useRouter();
	const [imageError, setImageError] = useState(false);
	const showFallback = !book.cover_image || imageError;

	return (
		<Pressable
			style={styles.container}
			onPress={() => router.push(`/book/${book.id}`)}
			accessibilityLabel={`Book cover: ${book.title} by ${book.author.join(', ')}`}
			accessibilityRole="button"
		>
			<View style={styles.coverContainer}>
				{showFallback ? (
					<View style={[styles.cover, { backgroundColor: getCoverColor(book.title) }]}>
						<Text style={styles.fallbackTitle} numberOfLines={3}>
							{book.title}
						</Text>
						<Text style={styles.fallbackAuthor} numberOfLines={1}>
							{book.author.join(', ')}
						</Text>
					</View>
				) : (
					<Image
						source={{ uri: book.cover_image! }}
						style={styles.cover}
						contentFit="cover"
						onError={() => setImageError(true)}
					/>
				)}
			</View>
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
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		padding: 12,
		gap: 12,
	},
	coverContainer: {
		shadowColor: '#000',
		shadowOffset: { width: 2, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 6,
		elevation: 4,
	},
	cover: {
		width: 80,
		height: 120,
		borderRadius: 4,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 8,
	},
	fallbackTitle: {
		color: '#fff',
		fontSize: 11,
		fontWeight: '700',
		textAlign: 'center',
	},
	fallbackAuthor: {
		color: 'rgba(255,255,255,0.6)',
		fontSize: 9,
		textAlign: 'center',
		marginTop: 4,
	},
	info: {
		flex: 1,
		justifyContent: 'center',
		gap: 4,
	},
	title: {
		fontSize: 16,
		fontWeight: '600',
	},
	author: {
		fontSize: 13,
		opacity: 0.7,
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
		backgroundColor: '#1a3a5c',
	},
	legendsBadge: {
		backgroundColor: '#5c3a1a',
	},
	badgeText: {
		color: '#fff',
		fontSize: 10,
		fontWeight: '600',
	},
	series: {
		fontSize: 11,
		opacity: 0.5,
		flex: 1,
	},
});
