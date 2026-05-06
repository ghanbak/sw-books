import { useLocalSearchParams } from 'expo-router';
import { BookOpen, Bookmark, Calendar, Hash, Layers, Library, Package } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Book3D } from '@/components/Book3D';
import { Book3DViewer } from '@/components/Book3DViewer';
import { AffiliateDisclosureSheet } from '@/components/affiliate-disclosure-sheet';
import { BookDetailSkeleton } from '@/components/book-detail-skeleton';
import { BuyOnAmazonButton } from '@/components/buy-on-amazon-button';
import { ErrorState } from '@/components/error-state';
import { tokens } from '@/constants/tokens';
import { buildAmazonSearchUrl } from '@/lib/amazon';
import type { Book } from '@/lib/hooks';
import { useBooks, useUserBooks } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';

export default function BookDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { books } = useBooks();
	const cached = useMemo(() => books.find((b) => b.id === id) ?? null, [books, id]);
	const [book, setBook] = useState<Book | null>(cached);
	const [loading, setLoading] = useState(!cached);
	const [error, setError] = useState<string | null>(null);
	const [viewerOpen, setViewerOpen] = useState(false);
	const [disclosureOpen, setDisclosureOpen] = useState(false);
	const { userBooks, toggleShelf } = useUserBooks();
	const insets = useSafeAreaInsets();
	const shelfEntry = book ? userBooks.get(book.id) : undefined;
	const amazonUrl = book ? buildAmazonSearchUrl(book.isbn?.[0]) : null;

	const fetchBook = useCallback(async () => {
		setLoading(true);
		setError(null);
		const { data, error: fetchError } = await supabase
			.from('books')
			.select('*')
			.eq('id', id)
			.maybeSingle();
		if (fetchError) {
			setError(fetchError.message);
			setBook(null);
		} else {
			setBook(data);
		}
		setLoading(false);
	}, [id]);

	useEffect(() => {
		// Use the catalog cache when available; only hit the network on cache miss.
		if (cached) {
			setBook(cached);
			setLoading(false);
			return;
		}
		fetchBook();
	}, [cached, fetchBook]);

	if (loading) {
		return <BookDetailSkeleton />;
	}

	if (error) {
		return <ErrorState title="Couldn't load this book" message={error} onRetry={fetchBook} />;
	}

	if (!book) {
		return (
			<View style={styles.center}>
				<Text style={styles.notFoundText}>
					If an item does not appear in our records, it does not exist.
				</Text>
			</View>
		);
	}

	const publishedDate = formatPublishedDate(book.date_published);

	const isbns = book.isbn ?? [];
	// Reserve space at the bottom of the scroll content so the floating
	// "Find on Amazon" button doesn't permanently obscure the last cards.
	const scrollPaddingBottom = amazonUrl ? 96 + insets.bottom : 48;

	return (
		<View style={styles.container}>
			<ScrollView
				style={styles.container}
				contentContainerStyle={[styles.content, { paddingBottom: scrollPaddingBottom }]}
				contentInsetAdjustmentBehavior="automatic"
			>
				{/* Hero cover */}
				<View style={styles.coverWrapper}>
					<Book3D
						coverUri={book.cover_image}
						title={book.title}
						author={book.author}
						width={200}
						height={300}
						onPress={() => setViewerOpen(true)}
						accessibilityLabel={`Book cover: ${book.title}. Tap to inspect in 3D.`}
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

				{/* Shelf actions */}
				<View style={styles.shelfButtons}>
					<ShelfButton
						icon={
							<Library
								size={16}
								color={shelfEntry?.owned ? tokens.text.inverse : tokens.text.secondary}
								strokeWidth={2}
							/>
						}
						label="Owned"
						active={shelfEntry?.owned ?? false}
						onPress={() => toggleShelf(book.id, 'owned')}
					/>
					<ShelfButton
						icon={
							<BookOpen
								size={16}
								color={shelfEntry?.read ? tokens.text.inverse : tokens.text.secondary}
								strokeWidth={2}
							/>
						}
						label="Read"
						active={shelfEntry?.read ?? false}
						onPress={() => toggleShelf(book.id, 'read')}
					/>
					<ShelfButton
						icon={
							<Bookmark
								size={16}
								color={shelfEntry?.want_to_read ? tokens.text.inverse : tokens.text.secondary}
								strokeWidth={2}
							/>
						}
						label="Want to Read"
						active={shelfEntry?.want_to_read ?? false}
						onPress={() => toggleShelf(book.id, 'want_to_read')}
					/>
				</View>

				{/* Synopsis */}
				{book.synopsis && (
					<View style={styles.section}>
						<Text style={styles.synopsis}>{book.synopsis}</Text>
					</View>
				)}

				{/* Details card */}
				<View style={styles.card}>
					<Text style={styles.cardTitle}>Details</Text>

					<DetailRow
						icon={<Layers size={14} color={tokens.text.hint} strokeWidth={2} />}
						label="Continuity"
						value={book.canon}
					/>
					<DetailRow
						icon={<BookOpen size={14} color={tokens.text.hint} strokeWidth={2} />}
						label="Type"
						value={book.type}
					/>
					{book.publisher && (
						<DetailRow
							icon={<Package size={14} color={tokens.text.hint} strokeWidth={2} />}
							label="Publisher"
							value={book.publisher}
						/>
					)}
					{publishedDate && (
						<DetailRow
							icon={<Calendar size={14} color={tokens.text.hint} strokeWidth={2} />}
							label="Published"
							value={publishedDate}
						/>
					)}
					{book.language && <DetailRow label="Language" value={book.language} />}
					{book.timeline_order != null && (
						<DetailRow
							label="Timeline"
							value={
								book.timeline_order < 0
									? `${Math.abs(book.timeline_order)} BBY`
									: `${book.timeline_order} ABY`
							}
							mono
						/>
					)}
				</View>

				{/* Series card */}
				{book.series_name && (
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Series</Text>
						<DetailRow label="Name" value={book.series_name} />
						{book.series_order != null && book.series_order > 0 && (
							<DetailRow
								icon={<Hash size={14} color={tokens.text.hint} strokeWidth={2} />}
								label="Book"
								value={`#${book.series_order}`}
							/>
						)}
					</View>
				)}

				{/* Formats card */}
				{book.format && book.format.length > 0 && (
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Formats</Text>
						<View style={styles.formatRow}>
							{book.format.map((f) => (
								<View key={f} style={styles.formatChip}>
									<Text style={styles.formatText}>{f}</Text>
								</View>
							))}
						</View>
					</View>
				)}

				{/* Identifiers card */}
				{isbns.length > 0 && (
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Identifiers</Text>
						{isbns.map((isbn) => (
							<DetailRow key={isbn} label="ISBN" value={isbn} mono />
						))}
					</View>
				)}

				{/* Era (if available) */}
				{book.era && (
					<View style={styles.card}>
						<Text style={styles.cardTitle}>Era</Text>
						<DetailRow label="Timeline Era" value={book.era} />
					</View>
				)}
			</ScrollView>

			{amazonUrl && (
				<View style={[styles.floatingContainer, { paddingBottom: 12 + insets.bottom }]}>
					<BuyOnAmazonButton url={amazonUrl} onInfoPress={() => setDisclosureOpen(true)} />
				</View>
			)}

			<AffiliateDisclosureSheet visible={disclosureOpen} onClose={() => setDisclosureOpen(false)} />
		</View>
	);
}

function formatPublishedDate(date: string | null): string | null {
	if (!date) return null;
	return new Date(date).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
}

function DetailRow({
	icon,
	label,
	value,
	mono,
}: {
	icon?: React.ReactNode;
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<View style={styles.detailRow}>
			{icon ?? <View style={{ width: 14 }} />}
			<Text style={styles.detailLabel}>{label}</Text>
			<Text style={[styles.detailValue, mono && styles.mono]}>{value}</Text>
		</View>
	);
}

function ShelfButton({
	icon,
	label,
	active,
	onPress,
}: {
	icon: React.ReactNode;
	label: string;
	active: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable style={[styles.shelfButton, active && styles.shelfButtonActive]} onPress={onPress}>
			{icon}
			<Text style={[styles.shelfButtonText, active && styles.shelfButtonTextActive]}>{label}</Text>
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
		paddingTop: Platform.OS === 'ios' ? 8 : 20,
		alignItems: 'center',
		paddingBottom: 48,
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

	// Floating Amazon button container — pinned to bottom, safe-area-aware
	floatingContainer: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: 20,
		paddingTop: 12,
		backgroundColor: tokens.surface.background,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: tokens.border.subtle,
	},

	// Hero
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
		marginBottom: 20,
		color: tokens.text.secondary,
	},

	// Shelf buttons
	shelfButtons: {
		flexDirection: 'row',
		gap: 10,
		width: '100%',
		marginBottom: 24,
	},
	shelfButton: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
		alignItems: 'center',
		gap: 4,
	},
	shelfButtonActive: {
		backgroundColor: tokens.accent.primary,
		borderColor: tokens.accent.primary,
	},
	shelfButtonText: {
		fontSize: 11,
		fontWeight: '600',
		color: tokens.text.secondary,
	},
	shelfButtonTextActive: {
		color: tokens.text.inverse,
	},

	// Synopsis
	section: {
		width: '100%',
		marginBottom: 20,
	},
	synopsis: {
		fontSize: 15,
		lineHeight: 23,
		color: tokens.text.primary,
	},

	// Cards (datapad style)
	card: {
		width: '100%',
		backgroundColor: tokens.surface.card,
		borderRadius: 12,
		padding: 16,
		gap: 0,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
		marginBottom: 12,
	},
	cardTitle: {
		fontSize: 11,
		fontWeight: '700',
		color: tokens.text.hint,
		textTransform: 'uppercase',
		letterSpacing: 1.2,
		marginBottom: 12,
	},

	// Detail rows
	detailRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingVertical: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: tokens.border.subtle,
	},
	detailRowPressable: {},
	detailLabel: {
		fontSize: 13,
		color: tokens.text.hint,
		width: 80,
	},
	detailValue: {
		fontSize: 14,
		color: tokens.text.primary,
		flex: 1,
	},
	mono: {
		fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
		fontSize: 13,
	},
	link: {
		color: tokens.accent.primary,
	},

	// Formats
	formatRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 6,
	},
	formatChip: {
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 6,
		backgroundColor: tokens.surface.background,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: tokens.border.subtle,
	},
	formatText: {
		fontSize: 12,
		color: tokens.text.secondary,
	},
});
