import { Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookDetailSkeleton } from '@/components/book-detail-skeleton';
import { BookDetailToolbar } from '@/components/book-detail-toolbar';
import { BuyOnAmazonButton } from '@/components/buy-on-amazon-button';
import { ErrorState } from '@/components/error-state';
import { HoloCover } from '@/components/holo-cover';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { buildAmazonSearchUrl } from '@/lib/amazon';
import type { Book } from '@/lib/hooks';
import { useBooks, useUserBooks } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import { eraLabel } from '@/lib/timeline';

export default function BookDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { books } = useBooks();
	const cached = useMemo(() => books.find((b) => b.id === id) ?? null, [books, id]);
	const [book, setBook] = useState<Book | null>(cached);
	const [loading, setLoading] = useState(!cached);
	const [error, setError] = useState<string | null>(null);
	const insets = useSafeAreaInsets();
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

	return (
		<View style={styles.container}>
			<Stack.Screen
				options={{
					headerLargeTitle: true,
					headerShadowVisible: false,
					title: '',
					headerBackTitle: 'Back',
				}}
			/>
			<FavoriteHeaderButton bookId={book.id} />

			<ScrollView
				style={styles.container}
				contentContainerStyle={[styles.content, { paddingBottom: 96 + insets.bottom }]}
				contentInsetAdjustmentBehavior="automatic"
			>
				{/* Title + author byline */}
				<Text style={styles.title}>{book.title}</Text>
				<Text style={styles.author}>{book.author.join(', ')}</Text>

				{/* Hologram cover */}
				<View style={styles.coverWrapper}>
					<HoloCover
						variant="hero"
						tilt={false}
						coverUri={book.cover_image}
						title={book.title}
						author={book.author}
						width={200}
						height={300}
					/>
				</View>

				{/* Synopsis */}
				{book.synopsis && <Text style={styles.synopsis}>{book.synopsis}</Text>}

				{/* Find on Amazon — now below the summary */}
				{amazonUrl && (
					<View style={styles.amazon}>
						<BuyOnAmazonButton url={amazonUrl} />
					</View>
				)}

				{/* Details */}
				<Card style={styles.card}>
					<Text style={styles.cardTitle}>Details</Text>
					<DetailRow
						icon={<SymbolView name="square.stack.3d.up" size={14} tintColor={tokens.text.hint} />}
						label="Continuity"
						value={book.canon}
					/>
					<DetailRow
						icon={<SymbolView name="book" size={14} tintColor={tokens.text.hint} />}
						label="Type"
						value={book.type}
					/>
					{book.publisher && (
						<DetailRow
							icon={<SymbolView name="building.columns" size={14} tintColor={tokens.text.hint} />}
							label="Publisher"
							value={book.publisher}
						/>
					)}
					{publishedDate && (
						<DetailRow
							icon={<SymbolView name="calendar" size={14} tintColor={tokens.text.hint} />}
							label="Published"
							value={publishedDate}
						/>
					)}
					{book.language && <DetailRow label="Language" value={book.language} />}
					{book.timeline_order != null && (
						<DetailRow label="Timeline" value={eraLabel(book.timeline_order)} mono />
					)}
				</Card>

				{/* Series */}
				{book.series_name && (
					<Card style={styles.card}>
						<Text style={styles.cardTitle}>Series</Text>
						<DetailRow label="Name" value={book.series_name} />
						{book.series_order != null && book.series_order > 0 && (
							<DetailRow
								icon={<SymbolView name="number" size={14} tintColor={tokens.text.hint} />}
								label="Book"
								value={`#${book.series_order}`}
							/>
						)}
					</Card>
				)}

				{/* Formats */}
				{book.format && book.format.length > 0 && (
					<Card style={styles.card}>
						<Text style={styles.cardTitle}>Formats</Text>
						<View style={styles.formatRow}>
							{book.format.map((f) => (
								<View key={f} style={styles.formatChip}>
									<Text style={styles.formatText}>{f}</Text>
								</View>
							))}
						</View>
					</Card>
				)}

				{/* Identifiers */}
				{isbns.length > 0 && (
					<Card style={styles.card}>
						<Text style={styles.cardTitle}>Identifiers</Text>
						{isbns.map((isbn) => (
							<DetailRow key={isbn} label="ISBN" value={isbn} mono />
						))}
					</Card>
				)}

				{/* Era */}
				{book.era && (
					<Card style={styles.card}>
						<Text style={styles.cardTitle}>Era</Text>
						<DetailRow label="Timeline Era" value={book.era} />
					</Card>
				)}
			</ScrollView>

			<BookDetailToolbar bookId={book.id} />
		</View>
	);
}

/**
 * Header favorite toggle as a native right-placement `Stack.Toolbar` button — the system
 * renders it as a real bar-button item (with its own glass), so we don't nest a custom glass
 * button inside the header's glass. Filled blue star when active.
 */
function FavoriteHeaderButton({ bookId }: { bookId: string }) {
	const { userBooks, toggleShelf } = useUserBooks();
	const active = userBooks.get(bookId)?.favorite ?? false;
	return (
		<Stack.Toolbar placement="right">
			<Stack.Toolbar.Button
				icon={active ? 'star.fill' : 'star'}
				tintColor={active ? tokens.accent.primary : undefined}
				accessibilityLabel={active ? 'Remove from favorites' : 'Add to favorites'}
				onPress={() => toggleShelf(bookId, 'favorite')}
			/>
		</Stack.Toolbar>
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
			{icon ?? <View style={styles.iconSpacer} />}
			<Text style={styles.detailLabel}>{label}</Text>
			<Text style={[styles.detailValue, mono && styles.mono]}>{value}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: tokens.surface.background,
	},
	content: {
		padding: 20,
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
	title: {
		fontSize: 20,
		fontWeight: '700',
		color: tokens.text.primary,
	},
	author: {
		fontSize: 16,
		marginTop: 2,
		color: tokens.text.secondary,
	},
	coverWrapper: {
		alignItems: 'center',
		marginTop: 20,
		marginBottom: 28,
	},
	synopsis: {
		fontSize: 14,
		lineHeight: 20,
		color: tokens.text.primary,
		marginBottom: 20,
	},
	amazon: {
		marginBottom: 20,
	},
	card: {
		marginBottom: 12,
	},
	cardTitle: {
		fontSize: 11,
		fontWeight: '700',
		color: tokens.text.hint,
		textTransform: 'uppercase',
		letterSpacing: 1.2,
		marginBottom: 4,
	},
	detailRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingVertical: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: tokens.border.subtle,
	},
	iconSpacer: {
		width: 14,
	},
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
		fontSize: 13,
	},
	formatRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 6,
		paddingTop: 8,
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
