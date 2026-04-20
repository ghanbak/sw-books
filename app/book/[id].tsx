import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Book3D } from '@/components/Book3D';
import { Book3DViewer } from '@/components/Book3DViewer';
import { tokens } from '@/constants/tokens';
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
				<ActivityIndicator size="large" color={tokens.accent.primary} />
			</View>
		);
	}

	if (!book) {
		return (
			<View style={styles.center}>
				<Text style={styles.notFoundText}>Book not found</Text>
			</View>
		);
	}

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			{/* Hero cover */}
			<View style={styles.coverWrapper}>
				<Book3D
					coverUri={book.cover_image}
					title={book.title}
					author={book.author}
					width={200}
					height={300}
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

			{/* Title + Author */}
			<Text style={styles.title}>{book.title}</Text>
			<Text style={styles.author}>{book.author.join(', ')}</Text>

			{/* Metadata card */}
			<View style={styles.metaCard}>
				<View style={styles.metaRow}>
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
						{new Date(book.date_published).toLocaleDateString('en-US', {
							year: 'numeric',
							month: 'long',
							day: 'numeric',
						})}
					</Text>
				)}

				{book.format && book.format.length > 0 && (
					<View style={styles.formats}>
						{book.format.map((f) => (
							<View key={f} style={styles.formatChip}>
								<Text style={styles.formatText}>{f}</Text>
							</View>
						))}
					</View>
				)}
			</View>

			{/* Synopsis */}
			{book.synopsis && (
				<View style={styles.synopsisSection}>
					<Text style={styles.synopsis}>{book.synopsis}</Text>
				</View>
			)}

			{/* Shelf actions */}
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
		backgroundColor: tokens.surface.background,
	},
	content: {
		padding: 20,
		alignItems: 'center',
		paddingBottom: 40,
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: tokens.surface.background,
	},
	notFoundText: {
		color: tokens.text.hint,
		fontSize: 16,
	},
	coverWrapper: {
		marginBottom: 24,
		marginTop: 8,
	},
	title: {
		fontSize: 24,
		fontWeight: '700',
		textAlign: 'center',
		marginBottom: 4,
		color: tokens.text.primary,
	},
	author: {
		fontSize: 16,
		textAlign: 'center',
		marginBottom: 16,
		color: tokens.text.secondary,
	},
	metaCard: {
		width: '100%',
		backgroundColor: tokens.surface.card,
		borderRadius: 12,
		padding: 16,
		gap: 8,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
		marginBottom: 16,
	},
	metaRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		flexWrap: 'wrap',
	},
	badge: {
		paddingHorizontal: 8,
		paddingVertical: 3,
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
		fontSize: 12,
		fontWeight: '600',
	},
	metaText: {
		fontSize: 13,
		color: tokens.text.hint,
	},
	seriesInfo: {
		fontSize: 14,
		fontStyle: 'italic',
		color: tokens.text.secondary,
	},
	date: {
		fontSize: 13,
		color: tokens.text.hint,
	},
	formats: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 6,
		marginTop: 4,
	},
	formatChip: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
		backgroundColor: tokens.surface.background,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
	},
	formatText: {
		fontSize: 12,
		color: tokens.text.secondary,
	},
	synopsisSection: {
		width: '100%',
		marginBottom: 20,
	},
	synopsis: {
		fontSize: 15,
		lineHeight: 23,
		color: tokens.text.primary,
	},
	shelfSection: {
		width: '100%',
	},
	shelfLabel: {
		fontSize: 17,
		fontWeight: '700',
		marginBottom: 12,
		color: tokens.text.primary,
	},
	shelfButtons: {
		flexDirection: 'row',
		gap: 10,
	},
	shelfButton: {
		flex: 1,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
		alignItems: 'center',
	},
	shelfButtonActive: {
		backgroundColor: tokens.accent.primary,
		borderColor: tokens.accent.primary,
	},
	shelfButtonText: {
		fontSize: 13,
		fontWeight: '600',
		color: tokens.text.secondary,
	},
	shelfButtonTextActive: {
		color: tokens.text.inverse,
	},
});
