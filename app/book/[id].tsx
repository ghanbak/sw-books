import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Book } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';

const COVER_COLORS = [
	'#8B0000', '#1a3a5c', '#2d4a22', '#4a2545', '#5c3a1a',
	'#1a4a4a', '#3d2b1f', '#4a1a1a', '#1a2a4a', '#3a1a4a',
];

function getCoverColor(title: string): string {
	let hash = 0;
	for (let i = 0; i < title.length; i++) {
		hash = (hash << 5) - hash + title.charCodeAt(i);
		hash |= 0;
	}
	return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
}

export default function BookDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [book, setBook] = useState<Book | null>(null);
	const [loading, setLoading] = useState(true);
	const [imageError, setImageError] = useState(false);

	useEffect(() => {
		async function fetchBook() {
			const { data } = await supabase.from('books').select('*').eq('id', id).single();
			setBook(data);
			setLoading(false);
		}
		fetchBook();
	}, [id]);

	if (loading) {
		return (
			<View style={styles.center}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	if (!book) {
		return (
			<View style={styles.center}>
				<Text>Book not found</Text>
			</View>
		);
	}

	const showFallback = !book.cover_image || imageError;

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<View style={styles.coverWrapper}>
				{showFallback ? (
					<View style={[styles.cover, { backgroundColor: getCoverColor(book.title) }]}>
						<Text style={styles.fallbackTitle} numberOfLines={4}>
							{book.title}
						</Text>
						<Text style={styles.fallbackAuthor} numberOfLines={2}>
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

			<Text style={styles.title}>{book.title}</Text>
			<Text style={styles.author}>{book.author.join(', ')}</Text>

			<View style={styles.meta}>
				<View
					style={[
						styles.badge,
						book.canon === 'Canon' ? styles.canonBadge : styles.legendsBadge,
					]}
				>
					<Text style={styles.badgeText}>{book.canon}</Text>
				</View>
				<Text style={styles.metaText}>{book.type}</Text>
				{book.publisher && <Text style={styles.metaText}>{book.publisher}</Text>}
			</View>

			{book.series_name && (
				<Text style={styles.seriesInfo}>
					{book.series_name}
					{book.series_order ? ` (#${book.series_order})` : ''}
				</Text>
			)}

			{book.date_published && (
				<Text style={styles.date}>
					Published: {new Date(book.date_published).toLocaleDateString()}
				</Text>
			)}

			{book.synopsis && <Text style={styles.synopsis}>{book.synopsis}</Text>}

			{book.format && book.format.length > 0 && (
				<View style={styles.formats}>
					{book.format.map((f) => (
						<View key={f} style={styles.formatChip}>
							<Text style={styles.formatText}>{f}</Text>
						</View>
					))}
				</View>
			)}

			{/* Shelf toggles will be wired in the bookshelf task */}
			<View style={styles.shelfSection}>
				<Text style={styles.shelfLabel}>Add to Shelf</Text>
				<View style={styles.shelfButtons}>
					<ShelfButton label="Owned" active={false} onPress={() => {}} />
					<ShelfButton label="Read" active={false} onPress={() => {}} />
					<ShelfButton label="Want to Read" active={false} onPress={() => {}} />
				</View>
			</View>
		</ScrollView>
	);
}

function ShelfButton({
	label,
	active,
	onPress,
}: { label: string; active: boolean; onPress: () => void }) {
	return (
		<Pressable
			style={[styles.shelfButton, active && styles.shelfButtonActive]}
			onPress={onPress}
		>
			<Text style={[styles.shelfButtonText, active && styles.shelfButtonTextActive]}>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	content: {
		padding: 20,
		alignItems: 'center',
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	coverWrapper: {
		shadowColor: '#000',
		shadowOffset: { width: 4, height: 8 },
		shadowOpacity: 0.3,
		shadowRadius: 12,
		elevation: 8,
		marginBottom: 20,
	},
	cover: {
		width: 180,
		height: 270,
		borderRadius: 6,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 16,
	},
	fallbackTitle: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '700',
		textAlign: 'center',
	},
	fallbackAuthor: {
		color: 'rgba(255,255,255,0.6)',
		fontSize: 12,
		textAlign: 'center',
		marginTop: 8,
	},
	title: {
		fontSize: 22,
		fontWeight: '700',
		textAlign: 'center',
		marginBottom: 4,
	},
	author: {
		fontSize: 16,
		opacity: 0.7,
		textAlign: 'center',
		marginBottom: 12,
	},
	meta: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		marginBottom: 8,
		flexWrap: 'wrap',
		justifyContent: 'center',
	},
	badge: {
		paddingHorizontal: 8,
		paddingVertical: 3,
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
		fontSize: 12,
		fontWeight: '600',
	},
	metaText: {
		fontSize: 13,
		opacity: 0.6,
	},
	seriesInfo: {
		fontSize: 14,
		fontStyle: 'italic',
		opacity: 0.7,
		marginBottom: 4,
	},
	date: {
		fontSize: 13,
		opacity: 0.5,
		marginBottom: 16,
	},
	synopsis: {
		fontSize: 15,
		lineHeight: 22,
		marginBottom: 20,
	},
	formats: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 6,
		marginBottom: 24,
	},
	formatChip: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
		backgroundColor: '#f0f0f0',
	},
	formatText: {
		fontSize: 12,
	},
	shelfSection: {
		width: '100%',
		marginTop: 8,
	},
	shelfLabel: {
		fontSize: 16,
		fontWeight: '600',
		marginBottom: 10,
	},
	shelfButtons: {
		flexDirection: 'row',
		gap: 10,
	},
	shelfButton: {
		flex: 1,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: '#f0f0f0',
		alignItems: 'center',
	},
	shelfButtonActive: {
		backgroundColor: '#1a3a5c',
	},
	shelfButtonText: {
		fontSize: 13,
		fontWeight: '600',
	},
	shelfButtonTextActive: {
		color: '#fff',
	},
});
