import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Book3D } from '@/components/Book3D';
import { Book3DViewer } from '@/components/Book3DViewer';
import type { Book } from '@/lib/hooks';
import { useUserBooks } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';

export default function BookDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [book, setBook] = useState<Book | null>(null);
	const [loading, setLoading] = useState(true);
	const [viewerOpen, setViewerOpen] = useState(false);
	const { userBooks, toggleShelf } = useUserBooks();
	const shelfEntry = book ? userBooks.get(book.id) : undefined;

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

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<View style={styles.coverWrapper}>
				<Book3D
					coverUri={book.cover_image}
					title={book.title}
					author={book.author}
					width={180}
					height={270}
					spineWidth={18}
					onPress={() => setViewerOpen(true)}
					accessibilityLabel={`Book cover: ${book.title} by ${book.author.join(', ')}. Tap to inspect in 3D.`}
				/>
			</View>

			<Book3DViewer
				visible={viewerOpen}
				onClose={() => setViewerOpen(false)}
				coverUri={book.cover_image}
				title={book.title}
				author={book.author}
			/>

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

			<View style={styles.shelfSection}>
				<Text style={styles.shelfLabel}>Add to Shelf</Text>
				<View style={styles.shelfButtons}>
					<ShelfButton
						label="Owned"
						active={shelfEntry?.owned ?? false}
						onPress={() => toggleShelf(book.id, 'owned')}
					/>
					<ShelfButton
						label="Read"
						active={shelfEntry?.read ?? false}
						onPress={() => toggleShelf(book.id, 'read')}
					/>
					<ShelfButton
						label="Want to Read"
						active={shelfEntry?.want_to_read ?? false}
						onPress={() => toggleShelf(book.id, 'want_to_read')}
					/>
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
		marginBottom: 20,
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
