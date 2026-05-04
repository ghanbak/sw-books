import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from 'react-native-reanimated';

import { tokens } from '@/constants/tokens';

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

export function getCoverColor(title: string): string {
	let hash = 0;
	for (let i = 0; i < title.length; i++) {
		hash = (hash << 5) - hash + title.charCodeAt(i);
		hash |= 0;
	}
	return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
}

export interface Book3DProps {
	coverUri: string | null;
	title: string;
	author: string[];
	width: number;
	height: number;
	onPress?: () => void;
	accessibilityLabel: string;
}

/**
 * Static 3D book cover for use in lists and detail screens.
 * Fixed -15deg angle with spine indent gradient and lighting.
 * No rotation interaction — that's only in Book3DViewer.
 */
export function Book3D({
	coverUri,
	title,
	author,
	width,
	height,
	onPress,
	accessibilityLabel,
}: Book3DProps) {
	const [imageError, setImageError] = useState(false);
	const showFallback = !coverUri || imageError;
	const isPressed = useSharedValue(false);

	const pressStyle = useAnimatedStyle(() => ({
		transform: [{ scale: withSpring(isPressed.value ? 0.96 : 1, { damping: 15 }) }],
	}));

	return (
		<Pressable
			onPress={onPress}
			onPressIn={() => {
				isPressed.value = true;
			}}
			onPressOut={() => {
				isPressed.value = false;
			}}
			accessibilityLabel={accessibilityLabel}
			accessibilityRole="button"
		>
			<Animated.View style={pressStyle}>
				<View
					style={{
						width,
						height,
						shadowColor: '#000',
						shadowOffset: { width: 3, height: 5 },
						shadowOpacity: 0.25,
						shadowRadius: 10,
						elevation: 8,
						borderRadius: 4,
						overflow: 'hidden',
						transform: [
							{ perspective: 800 },
							{ translateX: -width / 2 },
							{ rotateY: '-15deg' },
							{ translateX: width / 2 },
						],
					}}
				>
					{/* Cover content */}
					{showFallback ? (
						<View
							style={[styles.coverFill, { backgroundColor: getCoverColor(title) }]}
						>
							<View style={styles.fallbackContent}>
								<Text style={styles.fallbackTitle} numberOfLines={3}>
									{title}
								</Text>
								<Text style={styles.fallbackAuthor} numberOfLines={1}>
									{author.join(', ')}
								</Text>
							</View>
						</View>
					) : (
						<Image
							source={{ uri: coverUri }}
							style={styles.coverFill}
							contentFit="cover"
							onError={() => setImageError(true)}
						/>
					)}

					{/* Spine indent gradient — Apple Books style crease effect */}
					<LinearGradient
						colors={[
							'rgba(0,0,0,0.2)',
							'rgba(0,0,0,0.08)',
							'rgba(255,255,255,0.35)',
							'rgba(255,255,255,0.1)',
							'transparent',
						]}
						locations={[0, 0.15, 0.3, 0.5, 1]}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 0 }}
						style={[StyleSheet.absoluteFill, { width: width * 0.15 }]}
					/>

					{/* Overall light gradient — subtle directional light */}
					<LinearGradient
						colors={[
							'rgba(255,255,255,0.08)',
							'transparent',
							'rgba(0,0,0,0.1)',
						]}
						start={{ x: 0, y: 0 }}
						end={{ x: 1, y: 0 }}
						style={StyleSheet.absoluteFill}
					/>
				</View>
			</Animated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	coverFill: {
		...StyleSheet.absoluteFillObject,
	},
	fallbackContent: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 12,
	},
	fallbackTitle: {
		color: tokens.text.primary,
		fontWeight: '700',
		textAlign: 'center',
		fontSize: 13,
	},
	fallbackAuthor: {
		color: tokens.text.secondary,
		textAlign: 'center',
		fontSize: 10,
		marginTop: 4,
	},
});
