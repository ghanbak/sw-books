import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HoloCover } from '@/components/holo-cover';
import { CanonBadge } from '@/components/ui/canon-badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import type { Book } from '@/lib/hooks';
import { eraLabel } from '@/lib/timeline';

type DataPoint = { label: string; value: string };

/**
 * Book row for the Archives and Library lists (Figma 130:344): a static holo-cover
 * thumbnail, title/author + canon badge, and a right-hand "data points" column,
 * wrapped in the shared Card with its notch footer.
 */
export const BookCard = memo(function BookCard({ book }: { book: Book }) {
	const router = useRouter();

	const dataPoints: DataPoint[] = [];
	if (book.series_name) dataPoints.push({ label: 'SERIES', value: book.series_name });
	if (book.isbn?.[0]) dataPoints.push({ label: 'ISBN', value: book.isbn[0] });
	if (book.timeline_order != null)
		dataPoints.push({ label: 'TIMELINE', value: eraLabel(book.timeline_order) });
	if (book.format?.[0]) dataPoints.push({ label: 'FORMAT', value: book.format[0].toUpperCase() });

	return (
		<Pressable
			onPress={() => router.push(`/book/${book.id}`)}
			accessibilityRole="button"
			accessibilityLabel={`${book.title} by ${book.author.join(', ')}`}
			style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
		>
			<Card>
				<View style={styles.row}>
					<HoloCover
						coverUri={book.cover_image}
						title={book.title}
						author={book.author}
						width={66}
						height={108}
					/>
					<View style={styles.leading}>
						<Text style={styles.title} numberOfLines={2}>
							{book.title}
						</Text>
						<Text style={styles.author} numberOfLines={1}>
							{book.author.join(', ')}
						</Text>
						<CanonBadge canon={book.canon} style={styles.badge} />
					</View>
					{dataPoints.length > 0 && (
						<View style={styles.data}>
							{dataPoints.map((d) => (
								<View key={d.label} style={styles.dataRow}>
									<Text style={styles.dataLabel}>{d.label}</Text>
									<Text style={styles.dataValue} numberOfLines={1}>
										{d.value}
									</Text>
								</View>
							))}
						</View>
					)}
				</View>
			</Card>
		</Pressable>
	);
});

const styles = StyleSheet.create({
	wrap: {
		marginHorizontal: 12,
		marginVertical: 6,
	},
	pressed: {
		opacity: 0.7,
	},
	row: {
		flexDirection: 'row',
		gap: 12,
		alignItems: 'flex-start',
	},
	leading: {
		flex: 1,
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
	badge: {
		alignSelf: 'flex-start',
		marginTop: 2,
	},
	data: {
		width: 96,
		gap: 6,
		borderLeftWidth: StyleSheet.hairlineWidth,
		borderLeftColor: tokens.border.subtle,
		paddingLeft: 10,
	},
	dataRow: {
		gap: 1,
	},
	dataLabel: {
		fontSize: 9,
		fontWeight: '600',
		letterSpacing: 0.6,
		color: tokens.text.hint,
	},
	dataValue: {
		fontSize: 11,
		color: tokens.text.secondary,
	},
});
