import { Link } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HoloCover } from '@/components/holo-cover';
import { CanonBadge } from '@/components/ui/canon-badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { bookRowLabel } from '@/lib/book-a11y';
import type { Book } from '@/lib/hooks';
import { eraLabel } from '@/lib/timeline';

/**
 * Row geometry (#149). The cover is the widest element in the row, so the data column stays
 * narrower than it. 2:3 cover; the leading column (2-line title, author, 2-line series) and
 * the data column (badge + timeline) both stay under the cover height.
 */
export const BOOK_CARD_COVER = { width: 88, height: 132 } as const;
export const BOOK_CARD_DATA_WIDTH = 80;

/**
 * Book row for the Archives, Library and Search lists (Figma 130:344): a static holo-cover
 * thumbnail, title/author/series name, and a right-hand data column with the canon badge
 * and timeline era, wrapped in the shared Card with its notch footer (#271). ISBN and
 * edition details live on book detail.
 *
 * Opens detail through a `Link` (push, same `/book/[id]` route): on iOS 18+ the cover zooms into
 * the detail hero (`Link.AppleZoom` → `Link.AppleZoomTarget` in `app/book/[id].tsx`) and a
 * long-press peeks the detail (`Link.Preview`). Android and web get the plain push.
 */
export const BookCard = memo(function BookCard({ book }: { book: Book }) {
	return (
		// Link merges props into its child via Slot, which spreads `style`: the Pressable keeps a
		// plain style object (a style function is dropped, an array throws in dev) and the press
		// state lives on an inner View.
		<Link href={`/book/${book.id}`} push asChild>
			<Link.Trigger>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={bookRowLabel(book)}
					style={styles.wrap}
				>
					{({ pressed }) => (
						<View style={pressed ? styles.pressed : undefined}>
							<Card>
								<View style={styles.row}>
									<Link.AppleZoom>
										<View>
											<HoloCover
												coverUri={book.cover_image}
												title={book.title}
												author={book.author}
												width={BOOK_CARD_COVER.width}
												height={BOOK_CARD_COVER.height}
											/>
										</View>
									</Link.AppleZoom>
									<View style={styles.leading}>
										<Text style={styles.title} numberOfLines={2}>
											{book.title}
										</Text>
										<Text style={styles.author} numberOfLines={1}>
											{book.author.join(', ')}
										</Text>
										{book.series_name ? (
											<Text style={styles.series} numberOfLines={2}>
												{book.series_name}
											</Text>
										) : null}
									</View>
									<View style={styles.data}>
										<CanonBadge canon={book.canon} style={styles.badge} />
										{book.timeline_order != null ? (
											<View>
												<Text style={styles.dataLabel}>TIMELINE</Text>
												<Text style={styles.dataValue} numberOfLines={2}>
													{eraLabel(book.timeline_order)}
												</Text>
											</View>
										) : null}
									</View>
								</View>
							</Card>
						</View>
					)}
				</Pressable>
			</Link.Trigger>
			<Link.Preview />
		</Link>
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
		gap: 8,
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
	series: {
		fontSize: 13,
		lineHeight: 16,
		color: tokens.text.tertiary,
	},
	badge: {
		alignSelf: 'flex-start',
	},
	data: {
		width: BOOK_CARD_DATA_WIDTH,
		gap: 8,
		borderLeftWidth: StyleSheet.hairlineWidth,
		borderLeftColor: tokens.border.subtle,
		paddingLeft: 12,
	},
	dataLabel: {
		fontSize: 11,
		lineHeight: 12,
		fontWeight: '600',
		letterSpacing: 0.6,
		color: tokens.text.tertiary,
	},
	dataValue: {
		fontSize: 13,
		lineHeight: 16,
		color: tokens.text.secondary,
	},
});
