import ContentLoader, { Rect } from 'react-content-loader/native';
import { Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { tokens } from '@/constants/tokens';

/**
 * Skeleton placeholder for the book detail screen during fetch.
 * Mirrors the actual layout (cover, title, author, shelf buttons, synopsis,
 * details card) so the page doesn't reflow visually when data arrives.
 *
 * Single ContentLoader (one animated gradient) — multiple shimmers would
 * create per-frame work on top of FlatList virtualization upstream.
 */
export function BookDetailSkeleton() {
	const { width: screenWidth } = useWindowDimensions();
	// Match book detail's contentContainerStyle.padding (20)
	const innerWidth = screenWidth - 40;
	// Total skeleton height roughly matches book detail at fold
	const height = 720;

	return (
		<ScrollView
			style={styles.container}
			contentContainerStyle={styles.content}
			scrollEnabled={false}
		>
			<View style={{ width: innerWidth, height }}>
				<ContentLoader
					speed={1.4}
					width={innerWidth}
					height={height}
					viewBox={`0 0 ${innerWidth} ${height}`}
					backgroundColor={tokens.surface.card}
					foregroundColor="rgba(255,255,255,0.06)"
				>
					{/* Cover: 200x300 centered with 8px top padding */}
					<Rect x={(innerWidth - 200) / 2} y={8} rx={3} ry={3} width={200} height={300} />

					{/* Title bar: ~70% width centered, 24px tall, 24px below cover */}
					<Rect x={innerWidth * 0.15} y={332} rx={4} ry={4} width={innerWidth * 0.7} height={24} />

					{/* Author bar: ~50% width centered, 18px tall, 8px gap */}
					<Rect x={innerWidth * 0.25} y={364} rx={4} ry={4} width={innerWidth * 0.5} height={18} />

					{/* Shelf buttons: 3 across, equal width, 42px tall, 20px below author */}
					{[0, 1, 2].map((i) => {
						const buttonWidth = (innerWidth - 20) / 3; // 10px gaps between
						return (
							<Rect
								key={i}
								x={i * (buttonWidth + 10)}
								y={402}
								rx={8}
								ry={8}
								width={buttonWidth}
								height={42}
							/>
						);
					})}

					{/* Synopsis: 3 full-width lines, 14px tall each, 24px below buttons */}
					{[0, 1, 2].map((i) => (
						<Rect
							key={`syn-${i}`}
							x={0}
							y={468 + i * 22}
							rx={3}
							ry={3}
							width={i === 2 ? innerWidth * 0.6 : innerWidth}
							height={14}
						/>
					))}

					{/* Details card placeholder, 24px below synopsis */}
					<Rect x={0} y={560} rx={12} ry={12} width={innerWidth} height={140} />
				</ContentLoader>
			</View>
		</ScrollView>
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
	},
});
